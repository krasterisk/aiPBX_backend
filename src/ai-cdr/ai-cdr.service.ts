import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { AiCdrDto } from "./dto/ai-cdr.dto";
import sequelize, { Op } from "sequelize";
import { GetAiCdrDto } from "./dto/getAiCdr.dto";
import { AiCdr } from "./ai-cdr.model";
import { AiEvents } from "./ai-events.model";
import { AiEventDto } from "./dto/ia-events.dto";
import { GetDashboardAllData, GetDashboardData, GetDashboardDoneData, GetDashboardDto } from "./dto/getDashboardDto";
import { BillingService } from "../billing/billing.service";
import { Assistant } from '../assistants/assistants.model';
import { SipAccounts } from '../pbx-servers/sip-accounts.model';
import { AiAnalytics } from "../ai-analytics/ai-analytics.model";
import { BillingRecord } from "../billing/billing-record.model";
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
    private readonly dialect: string;

    constructor(
        @InjectModel(AiCdr) private aiCdrRepository: typeof AiCdr,
        @InjectModel(AiEvents) private aiEventsRepository: typeof AiEvents,
        @InjectModel(Assistant) private readonly assistantRepository: typeof Assistant,
        private readonly billingService: BillingService,
        @Inject(forwardRef(() => AiAnalyticsService)) private readonly aiAnalyticsService: AiAnalyticsService
    ) {
        this.dialect = this.aiCdrRepository.sequelize.getDialect();
    }

    // ─── Dialect-aware SQL helpers ───

    /** Quote identifier: backticks for MySQL, double quotes for Postgres */
    private q(name: string): string {
        return this.dialect === 'postgres' ? `"${name}"` : `\`${name}\``;
    }

    /** DATE(col) — extract date from timestamp */
    private sqlDate(col: string): string {
        return this.dialect === 'postgres' ? `${col}::date` : `DATE(${col})`;
    }

    /** Group by day with a label */
    private sqlGroupByDay(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `${col}::date`, label: `${col}::date as label` }
            : { groupBy: `DAY(${col})`, label: `DATE(${col}) as label` };
    }

    /** Group by month with a label */
    private sqlGroupByMonth(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `TO_CHAR(${col}, 'YYYY-MM')`, label: `TO_CHAR(${col}, 'YYYY-MM') as label` }
            : { groupBy: `MONTH(${col})`, label: `DATE_FORMAT(${col}, '%Y-%m') as label` };
    }

    /** Group by year with a label */
    private sqlGroupByYear(col: string): { groupBy: string; label: string } {
        return this.dialect === 'postgres'
            ? { groupBy: `TO_CHAR(${col}, 'YYYY')`, label: `TO_CHAR(${col}, 'YYYY') as label` }
            : { groupBy: `YEAR(${col})`, label: `DATE_FORMAT(${col}, '%Y') as label` };
    }

    /** JSON_EXTRACT for sorting by nested JSON path */
    private sqlJsonExtract(table: string, column: string, jsonPath: string): string {
        return this.dialect === 'postgres'
            ? `(${this.q(table)}.${this.q(column)}::jsonb->'scenario_analysis'->>'success')`
            : `JSON_EXTRACT(${this.q(table)}.${this.q(column)}, '${jsonPath}')`;
    }

    async cdrCreate(dto: AiCdrDto) {
        try {
            const [aiCdr, created] = await this.aiCdrRepository.findOrCreate({
                where: { channelId: dto.channelId },
                defaults: dto as any,
            });
            if (!created) {
                this.logger.warn(`CDR already exists for ${dto.channelId}, skipping duplicate`);
            }
            return aiCdr;
        } catch (e) {
            throw new HttpException('[AiCdr]: Request error' + e, HttpStatus.BAD_REQUEST)
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

            const billingResult = await this.billingService.finalizeCallBilling(channelId);
            const cost = billingResult.totalCost;

            // Generate recordUrl
            let recordUrl = '';
            if (assistantId) {
                const assistant = await this.assistantRepository.findOne({
                    where: { id: assistantId },
                    include: [SipAccounts]
                });

                if (assistant?.sipAccount?.records) {
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
            const searchConditions: any[] = [
                {
                    callerId: {
                        [sequelize.Op.like]: `%${search}%`
                    }
                },
                {
                    assistantName: {
                        [sequelize.Op.like]: `%${search}%`
                    }
                },
            ];

            // Only search in associated analytics.summary when there's actual search text,
            // otherwise Sequelize puts it in a subquery where the JOIN isn't available
            if (search && search.trim() !== '') {
                searchConditions.push({
                    '$analytics.summary$': {
                        [sequelize.Op.like]: `%${search}%`
                    }
                });
            }

            let whereClause: any = {
                [sequelize.Op.or]: searchConditions
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
                    [sequelize.Op.gte]: sequelize.literal(this.sqlDate(`'${startDate}'`))
                };
            }
            // Обработка случая, когда указан только endDate
            else if (endDate) {
                whereClause.createdAt = {
                    [sequelize.Op.lte]: sequelize.literal(this.sqlDate(`'${endDate}'`))
                };
            }

            if (userId !== undefined) {
                whereClause.userId = String(userId);
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

            if (query.source) {
                whereClause.source = query.source;
            }

            const sortField = query.sortField || 'createdAt';
            const sortOrder = query.sortOrder || 'DESC';

            // Build order clause based on field type
            let orderClause: any[];
            const isAssociatedSort = sortField === 'csat' || sortField === 'scenarioSuccess';
            // subQuery: false needed when sorting/searching by JOINed fields
            const needsFlatQuery = isAssociatedSort || (search && search.trim() !== '');

            if (sortField === 'csat') {
                // Sort by associated AiAnalytics.csat column
                orderClause = [[{ model: AiAnalytics, as: 'analytics' }, 'csat', sortOrder]];
            } else if (sortField === 'scenarioSuccess') {
                // Sort by JSON field inside analytics.metrics (dialect-aware)
                orderClause = [[sequelize.literal(`${this.sqlJsonExtract('analytics', 'metrics', '$.scenario_analysis.success')} ${sortOrder}`)]];
            } else {
                orderClause = [[sortField, sortOrder]];
            }

            const { count, rows } = await this.aiCdrRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                // subQuery: false needed for PostgreSQL compatibility with distinct + includes
                subQuery: false,
                where: whereClause,
                order: orderClause,
                include: [
                    {
                        model: AiAnalytics,
                        as: 'analytics',
                        required: false
                    },
                    {
                        model: BillingRecord,
                        as: 'billingRecords',
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
        const source = query.source || "";

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


        const tbl = this.q('aiCdr');
        const col = this.q('createdAt');
        const colDate = this.sqlDate(col);
        let whereClause: string = `WHERE (${colDate} BETWEEN ${this.sqlDate(`'${startDate}'`)} AND ${this.sqlDate(`'${endDate}'`)})`;
        let whereAddClause: string = "";
        let groupByClause = "";
        let dopAttr = "";

        if (dateArray.length <= 31) {
            const g = this.sqlGroupByDay(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        } else if (dateArray.length > 31 && dateArray.length <= 366) {
            const g = this.sqlGroupByMonth(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        } else if (dateArray.length > 366) {
            const g = this.sqlGroupByYear(col);
            groupByClause = `GROUP BY ${g.groupBy}`;
            dopAttr = g.label;
        }

        if (userId) {
            whereAddClause += `AND ${this.q('userId')} = '${userId}' `;
        }

        if (assistantId) {
            whereAddClause += `AND ${this.q('assistantId')} IN (${assistantId}) `;
        }

        if (source) {
            whereAddClause += `AND ${this.q('source')} = '${source}' `;
        }

        const attrPeriodClause = `${dopAttr}, COUNT(*) as "allCount", SUM(${this.q('tokens')}) as "tokensCount", SUM(${this.q('duration')}) as "durationCount", SUM(${this.q('cost')}) as "amount"`;
        const attrTotalClause = `COUNT(*) as "allCount", SUM(${this.q('tokens')}) as "allTokensCount", SUM(${this.q('duration')}) as "allDurationCount", SUM(${this.q('cost')}) as "allCost"`;

        const requestPeriod = `SELECT ${attrPeriodClause} FROM ${tbl} ${whereClause} ${whereAddClause} ${groupByClause}`;
        const request = `SELECT ${attrTotalClause} FROM ${tbl} ${whereClause} ${whereAddClause}`;

        try {
            const chartData = await this.aiCdrRepository.sequelize.query(requestPeriod, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardDoneData[];

            const totalData = await this.aiCdrRepository.sequelize.query(request, {
                type: sequelize.QueryTypes.SELECT
            }) as GetDashboardAllData;

            const casksDashboardData: GetDashboardData = {
                chartData: chartData.map(d => ({
                    ...d,
                    allCount: Number(d.allCount) || 0,
                    tokensCount: Number(d.tokensCount) || 0,
                    durationCount: Number(d.durationCount) || 0,
                    amount: Number(d.amount) || 0,
                })) as GetDashboardDoneData[],
                allCount: Number(totalData[0]?.allCount) || 0,
                allTokensCount: Number(totalData[0]?.allTokensCount) || 0,
                allDurationCount: Number(totalData[0]?.allDurationCount) || 0,
                allCost: Number(totalData[0]?.allCost) || 0
            };

            return casksDashboardData;
        } catch (e) {
            throw new HttpException({ message: "[Dashboard]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }
}
