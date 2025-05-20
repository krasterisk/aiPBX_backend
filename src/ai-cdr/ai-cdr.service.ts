import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {AiCdrDto} from "./dto/ai-cdr.dto";
import sequelize from "sequelize";
import {GetAiCdrDto} from "./dto/getAiCdr.dto";
import {AiCdr} from "./ai-cdr.model";
import {AiEvents} from "./ai-events.model";
import {AiEventDto} from "./dto/ia-events.dto";

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

    constructor(
        @InjectModel(AiCdr) private aiCdrRepository: typeof AiCdr,
        @InjectModel(AiEvents) private aiEventsRepository: typeof AiEvents
    ) {
    }

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
                where: {channelId: updates.channelId}
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

    async cdrHangup(channelId) {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({
                where: {channelId}
            })

            if (!aiCdr) {
                throw new HttpException('aiCdr not found', HttpStatus.NOT_FOUND)
            }
            const now = new Date();
            const createdAt = new Date(aiCdr.createdAt);
            const duration = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

            await aiCdr.update({duration})
            return aiCdr
        } catch (e) {
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
                where: {channelId}
            })
            if (!aiEvents) {
                throw new HttpException('aiEvents not found', HttpStatus.NOT_FOUND)
            }
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
                throw new HttpException('aiEvents not found', HttpStatus.NOT_FOUND);
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
                        return items.flatMap((item: any) =>
                            item?.content?.map((c: any) => ({
                                timestamp,
                                role: 'Assistant',
                                text: c.transcript
                            })) || []
                        );
                    }

                    return [];
                });
            });

            return dialog;
        } catch (e) {
            throw new HttpException('[AiEvents]: Get events error: ' + e.message, HttpStatus.BAD_REQUEST);
        }
    }

    async get(query: GetAiCdrDto, isAdmin: boolean) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;

            const userId = !query.userId && isAdmin ? undefined : query.userId;

            // Prepare the where clause
            let whereClause: any = {
                [sequelize.Op.or]: [
                    {
                        callerId: {
                            [sequelize.Op.like]: `%${search}%`
                        },
                        assistantName: {
                            [sequelize.Op.like]: `%${search}%`
                        }
                    }
                ]
            };
            if (userId !== undefined) {
                whereClause.userId = userId;
            }

            const {count, rows} = await this.aiCdrRepository.findAndCountAll({
                offset,
                limit,
                where: whereClause,
                order: [['createdAt', 'DESC']]
            });

            return {count, rows}

        } catch (e) {
            throw new HttpException({message: "[AiCdr]: Request error", error: e}, HttpStatus.BAD_REQUEST);
        }
    }


}
