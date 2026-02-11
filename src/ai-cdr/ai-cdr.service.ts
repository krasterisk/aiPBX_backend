import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { AiCdrDto } from "./dto/ai-cdr.dto";
import sequelize, { Op } from "sequelize";
import { GetAiCdrDto } from "./dto/getAiCdr.dto";
import { AiCdr } from "./ai-cdr.model";
import { AiEvents } from "./ai-events.model";
import { AiEventDto } from "./dto/ia-events.dto";
import { GetDashboardAllData, GetDashboardData, GetDashboardDoneData, GetDashboardDto } from "./dto/getDashboardDto";
import { Prices } from "../prices/prices.model";
import { UsersService } from "../users/users.service";
import { Assistant } from '../assistants/assistants.model';
import { SipAccounts } from '../pbx-servers/sip-accounts.model';
import { AiAnalytics } from "../ai-analytics/ai-analytics.model";
import { AiAnalyticsService } from "../ai-analytics/ai-analytics.service";
import { forwardRef } from "@nestjs/common";

interface AudioTranscriptionEvent {
    type: 'conversation.item.input_audio_transcription.completed';
    transcript: string;
}

interface AssistantResponseEvent {
    type: 'response.done';
    response?: {
        output: {
            content: { transcript: string }[];
        }[];
    };
}

type AiEventItem = AudioTranscriptionEvent | AssistantResponseEvent;

@Injectable()
export class AiCdrService {
    private readonly logger = new Logger(AiCdrService.name);

    constructor(
        @InjectModel(AiCdr) private aiCdrRepository: typeof AiCdr,
        @InjectModel(AiEvents) private aiEventsRepository: typeof AiEvents,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        @InjectModel(Assistant) private readonly assistantRepository: typeof Assistant,
        private readonly usersService: UsersService,
        @Inject(forwardRef(() => AiAnalyticsService)) private readonly aiAnalyticsService: AiAnalyticsService
    ) { }

    async cdrCreate(dto: AiCdrDto) {
        try {
            const aiCdr = await this.aiCdrRepository.create(dto)
            return aiCdr
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiCdr already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiCdr]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async cdrUpdate(updates: Partial<AiCdr>) {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({
                where: { channelId: updates.channelId }
            })

            if (!aiCdr) {
                throw new HttpException('aiCdr not found', HttpStatus.NOT_FOUND)
            }
            await aiCdr.update(updates)
            return aiCdr
        } catch (e) {
            throw new HttpException('[AiCdr]: Update error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async cdrHangup(channelId: string, assistantId: number) {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({
                where: { channelId }
            })

            if (!aiCdr) {
                this.logger.error('aiCdr not found')
                throw new HttpException('aiCdr not found', HttpStatus.NOT_FOUND)
            }
            const now = new Date();
            const createdAt = new Date(aiCdr.createdAt);
            const duration = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

            const tokens = aiCdr.tokens
            let cost: number = 0
            if (tokens > 0) {
                const userId = aiCdr.userId
                const price = await this.pricesRepository.findOne({
                    where: { userId }
                })
                cost = tokens * (price.realtime / 1000000)
                if (cost > 0) {
                    await this.usersService.decrementUserBalance(userId, cost)
                }

            }

            // Generate recordUrl
            let recordUrl = '';
            if (assistantId) {
                const assistant = await this.assistantRepository.findOne({
                    where: { id: assistantId },
                    include: [SipAccounts]
                });

                if (assistant && assistant.sipAccount) {
                    const sipUri = assistant.sipAccount.sipUri;
                    const serverUrl = sipUri.split('@')[1];
                    if (serverUrl) {
                        recordUrl = `https://${serverUrl}/records/${assistant.uniqueId}/${channelId}.mp3`;
                    }
                }
            }
            await aiCdr.update({ duration, cost, recordUrl })

            if (assistantId) {
                const assistant = await this.assistantRepository.findByPk(assistantId);
                if (assistant && assistant.analytic) {
                    // Fire and forget analysis
                    this.aiAnalyticsService.analyzeCall(channelId);
                }
            }
            return aiCdr
        } catch (e) {
            this.logger.error('[AiCdr]: Update error ' + e.message)
            throw new HttpException('[AiCdr]: Update error' + e, HttpStatus.BAD_REQUEST)
        }
    }


    async eventCreate(dto: AiEventDto) {
        try {
            const aiEvent = await this.aiEventsRepository.create(dto)
            return aiEvent
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiEvent already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiEvent]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getEvents(channelId: string) {
        try {
            const aiEvents = await this.aiEventsRepository.findAll({
                where: { channelId }
            })
            return aiEvents
        } catch (e) {
            throw new HttpException('[AiEvents]: Get events error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getDialogs(channelId: string) {
        try {
            const aiEvents = await this.aiEventsRepository.findAll({
                where: { channelId },
                order: [['createdAt', 'ASC']],
            });

            if (!aiEvents || aiEvents.length === 0) {
                return [];
            }

            const dialog = aiEvents.flatMap(entry => {
                const parsedEvents = Array.isArray(entry.events) ? entry.events : [entry.events];
                const timestamp = new Date(entry.createdAt).toLocaleTimeString(
                    'ru-RU',
                    {
                        hour12: false,
                        timeZone: process.env.TIMEZONE
                    }
                )

                return parsedEvents.flatMap((event: any) => {
                    if (event.type === 'conversation.item.input_audio_transcription.completed') {
                        return [{
                            timestamp,
                            role: 'User',
                            text: event.transcript
                        }];
                    }

                    if (event.type === 'response.done') {
                        const items = event.response?.output || [];
                        return items.flatMap((item: any) => {
                            const entries = [];
                            if (item?.content) {
                                item.content.forEach((c: any) => {
                                    if (c.transcript) {
                                        entries.push({
                                            timestamp,
                                            role: 'Assistant',
                                            text: c.transcript
                                        });
                                    }
                                });
                            }
                            if (item.type === 'function_call') {
                                entries.push({
                                    timestamp,
                                    role: 'Assistant',
                                    text: `Function call: ${item.name}(${item.arguments})`
                                });
                            }
                            return entries;
                        });
                    }

                    if (event.type === 'conversation.item.created' && event.item?.type === 'function_call_output') {
                        return [{
                            timestamp,
                            role: 'System',
                            text: `Function result: ${event.item.output}`
                        }];
                    }

                    return [];
                });
            });

            return dialog;
        } catch (e) {
            throw new HttpException('[AiEvents]: Get events error: ' + e.message, HttpStatus.BAD_REQUEST);
        }
    }

    async get(query: GetAiCdrDto, isAdmin: boolean, realUserId: string) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;
            const endDate = query.endDate;
            const startDate = query.startDate;

            if (!realUserId && !isAdmin) {
                throw new HttpException({ message: "[Report]:  userId must be set" }, HttpStatus.BAD_REQUEST);
            }

            const userId = !query.userId && isAdmin
                ? undefined
                : !isAdmin
                    ? realUserId
                    : Number(query.userId);

            // Prepare the where clause
            let whereClause: any = {
                [sequelize.Op.or]: [
                    {
                        callerId: {
                            [sequelize.Op.like]: `%${search}%`
                        }
                    },
                    {
                        assistantName: {
                            [sequelize.Op.like]: `%${search}%`
                        }
                    }
                ]
            };

            // Обработка случаев, когда указаны оба параметра startDate и endDate
            if (startDate && endDate) {
                whereClause.createdAt = {
                    // [sequelize.Op.gte]: sequelize.literal(`DATE('${startDate}')`),
                    // [sequelize.Op.lte]: sequelize.literal(`DATE('${endDate}')`)
                    [sequelize.Op.between]: [startDate + " 00:00", endDate + " 23:59"]
                };
            }
            // Обработка случая, когда указан только startDate
            else if (startDate) {
                whereClause.createdAt = {
                    [sequelize.Op.gte]: sequelize.literal(`DATE('${startDate}')`)
                };
            }
            // Обработка случая, когда указан только endDate
            else if (endDate) {
                whereClause.createdAt = {
                    [sequelize.Op.lte]: sequelize.literal(`DATE('${endDate}')`)
                };
            }

            if (userId !== undefined) {
                whereClause.userId = userId;
            }

            const assistantIds = Array.isArray(query.assistantId)
                ? query.assistantId
                : typeof query.assistantId === 'string'
                    ? query.assistantId.split(',').map(id => id.trim()).filter(Boolean)
                    : [];

            if (assistantIds && assistantIds.length > 0) {
                whereClause.assistantId = {
                    [Op.in]: assistantIds
                };
            }

            const { count, rows } = await this.aiCdrRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [
                    {
                        model: AiAnalytics,
                        as: 'analytics',
                        required: false
                    }
                ]
            });

            const totalCostRaw = await this.aiCdrRepository.sum('cost', {
                where: whereClause
            });
            const totalCost = parseFloat((totalCostRaw || 0).toFixed(2));


            return { count, totalCost, rows }

        } catch (e) {
            throw new HttpException({ message: "[AiCdr]: Request error", error: e }, HttpStatus.BAD_REQUEST);
        }
    }

    async getDashboardData(query: GetDashboardDto, isAdmin: boolean) {
        const assistantId = query.assistantId || "";
        const startDate = query.startDate || "";
        const endDate = query.endDate || "";
        const tab = query.tab || "";

        const userId = !query.userId && isAdmin ? undefined : Number(query.userId);

        // const userId = undefined;

        if (!startDate || !endDate) {
            throw new HttpException({ message: "[Dashboard]: Request error" }, HttpStatus.BAD_REQUEST);
        }

        const dateArray = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        while (start <= end) {
            dateArray.push(start.getDate());
            start.setDate(start.getDate() + 1);
        }


        let whereClause: string = `WHERE (DATE(createdAt) between DATE('${startDate}') AND DATE('${endDate}'))`;
        let whereAddClause: string = "";
        let groupByClause = "";
        let dopAttr = "";

        if (dateArray.length <= 31) {
            groupByClause = "GROUP by DAY(createdAt)";
            dopAttr = "DATE(createdAt) as label";
        } else if (dateArray.length > 31 && dateArray.length <= 366) {
            groupByClause = "GROUP by MONTH(createdAt)";
            dopAttr = "DATE_FORMAT(createdAt, '%Y-%m') as label";
        } else if (dateArray.length > 366) {
            groupByClause = "GROUP by YEAR(createdAt)";
            dopAttr = "DATE_FORMAT(createdAt, '%Y') as label";
        }

        if (userId) {
            whereAddClause += `AND userId = ${userId} `;
        }

        if (assistantId) {
            whereAddClause += `AND assistantId IN (${assistantId}) `;
        }

        const attrPeriodClause = `${dopAttr}, COUNT(*) as allCount, SUM(tokens) as tokensCount, SUM(duration) as durationCount, SUM(cost) as amount`;
        const attrTotalClause = `COUNT(*) as allCount, SUM(tokens) as allTokensCount, SUM(duration) as allDurationCount, SUM(cost) as allCost`;

        const requestPeriod = `SELECT ${attrPeriodClause} FROM aiCdr ${whereClause} ${whereAddClause} ${groupByClause}`;
        const request = `SELECT ${attrTotalClause} FROM aiCdr ${whereClause} ${whereAddClause}`;

        try {
            const chartData = await this.aiCdrRepository.sequelize.query(requestPeriod, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardDoneData[];

            const totalData = await this.aiCdrRepository.sequelize.query(request, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardAllData;

            const casksDashboardData: GetDashboardData = {
                chartData,
                allCount: totalData[0].allCount ?? 0,
                allTokensCount: totalData[0].allTokensCount ?? 0,
                allDurationCount: totalData[0].allDurationCount ?? 0,
                allCost: totalData[0].allCost ?? 0
            };

            return casksDashboardData;
        } catch (e) {
            throw new HttpException({ message: "[Dashboard]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }
}
