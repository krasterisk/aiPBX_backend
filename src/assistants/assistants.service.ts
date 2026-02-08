import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Assistant } from "./assistants.model";
import { AssistantDto } from "./dto/assistant.dto";
import { GetAssistantsDto } from "./dto/getAssistants.dto";
import sequelize from "sequelize";
import { nanoid } from 'nanoid';

@Injectable()
export class AssistantsService {
    private readonly logger = new Logger(AssistantsService.name);

    constructor(@InjectModel(Assistant) private assistantsRepository: typeof Assistant) { }

    async create(dto: AssistantDto[], isAdmin: boolean, userId: string) {
        try {
            const assistants = [];
            for (const assistant of dto) {
                const uniqueId = nanoid(15)

                const creationAttrs = {
                    ...assistant,
                    uniqueId,
                    userId: assistant.userId !== undefined && assistant.userId !== null
                        ? Number(assistant.userId)
                        : Number(userId)
                }

                const result = await this.assistantsRepository.create(creationAttrs as any)

                if (result && assistant.tools.length) {
                    const toolsIds = assistant.tools.map((tool) => tool.id)
                    await result.$set('tools', toolsIds)
                    result.tools = assistant.tools
                }
                assistants.push(result)
            }
            return assistants
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                this.logger.error("Assistant already exists")
                throw new HttpException('Assistant already exists', HttpStatus.BAD_REQUEST)
            }
            this.logger.error("Assistant create error", e)
            throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Assistant> | AssistantDto) {
        try {
            if (updates.userId) {
                // @ts-ignore
                updates.userId = Number(updates.userId)
            }
            const assistant = await this.assistantsRepository.findByPk((updates as any).id)
            if (!assistant) {
                throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
            }
            await assistant.update(updates as any)

            if (updates.tools && updates.tools.length) {
                const toolIds = updates.tools.map(tool => tool.id);
                await assistant.$set('tools', toolIds);
                assistant.tools = updates.tools;
            } else if (updates.tools?.length === 0) {
                await assistant.$set('tools', []);
                assistant.tools = [];
            }
            return assistant
        } catch (e) {
            throw new HttpException('[Assistant]:  Request error' + e, HttpStatus.BAD_REQUEST)

        }
    }

    async delete(id: string) {
        try {
            await this.assistantsRepository.destroy({ where: { id: id } })
            return { message: 'Assistant deleted successfully', statusCode: HttpStatus.OK }
        } catch (e) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        }
    }

    async get(query: GetAssistantsDto, isAdmin: boolean, userId: string) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;

            const assistantUser = !isAdmin ? Number(userId) : Number(query.userId) || undefined

            if (!userId && !isAdmin) {
                this.logger.error("No userId detected and user is not admin")
                throw new HttpException({ message: "Request error" }, HttpStatus.BAD_REQUEST);
            }

            // Prepare the where clause
            let whereClause: any = {
                [sequelize.Op.or]: [
                    {
                        name: {
                            [sequelize.Op.like]: `%${search}%`
                        }
                    }
                ]
            };

            if (assistantUser !== undefined) {
                whereClause.userId = assistantUser;
            }

            const assistants = await this.assistantsRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                include: [
                    {
                        all: true,
                        attributes: {
                            exclude: [
                                "password",
                                "activationCode",
                                "resetPasswordLink",
                                "googleId",
                                "telegramId",
                                "activationExpires",
                                "isActivated",
                                "vpbx_user_id"
                            ]
                        }
                    }
                ],
                where: whereClause
            });
            return assistants;
        } catch (e) {
            this.logger.error("Assistant create error: ", e.name, e.message)
            throw new HttpException({ message: e.message }, HttpStatus.BAD_REQUEST);
        }
    }

    async getAll(realUserId: string, isAdmin: boolean) {
        try {

            if (!realUserId && !isAdmin) {
                throw new HttpException({ message: "[Assistants]:  userId must be set" }, HttpStatus.BAD_REQUEST);
            }

            const userId = isAdmin ? undefined : Number(realUserId);

            const whereClause: any = userId ? { userId } : {}

            const assistant = await this.assistantsRepository.findAll({
                where: whereClause,
                include: [
                    {
                        all: true,
                        attributes: {
                            exclude: [
                                "password",
                                "activationCode",
                                "resetPasswordLink",
                                "googleId",
                                "telegramId",
                                "activationExpires",
                                "isActivated",
                                "vpbx_user_id"
                            ]
                        }
                    }
                ]
            })
            if (assistant) {
                return assistant
            }
        } catch (e) {
            throw new HttpException({ message: '[Assistant]:  Request error' } + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const assistant = await this.assistantsRepository.findOne({
            where: { id },
            include: [
                {
                    all: true,
                    attributes: {
                        exclude: [
                            "password",
                            "activationCode",
                            "resetPasswordLink",
                            "googleId",
                            "telegramId",
                            "activationExpires",
                            "isActivated",
                            "vpbx_user_id"
                        ]
                    }
                }
            ]
        })
        if (!assistant) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        } else {
            return assistant
        }
    }

    async getByUniqueId(uniqueId: string) {
        const assistant = await this.assistantsRepository.findOne({
            where: { uniqueId },
            include: [
                {
                    all: true,
                    attributes: {
                        exclude: [
                            "password",
                            "activationCode",
                            "resetPasswordLink",
                            "googleId",
                            "telegramId",
                            "activationExpires",
                            "isActivated",
                            "vpbx_user_id"
                        ]
                    }
                }
            ]
        })
        if (!assistant) {
            new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        } else {
            return assistant
        }
    }

    async generatePrompt(prompt: string) {
        try {

            if (!prompt) {
                throw new HttpException('Prompt is empty', HttpStatus.BAD_REQUEST);
            }

            // Initialize OpenAI client
            const OpenAI = require('openai').default;
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });

            const systemPrompt = `You are Prompt Generator that helps generate system prompt for voice bots.
Based on the user's request, generate system prompt for the bot's behavior
Return your response in JSON format with one field: "instruction".
The instruction should be detailed and comprehensive.`;

            const response = await openai.chat.completions.create({
                model: 'gpt-4.1-mini-2025-04-14',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.7
            });

            const content = response.choices[0]?.message?.content;

            if (!content) {
                throw new HttpException('Failed to generate prompt', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            const result = JSON.parse(content);

            return {
                success: true,
                instruction: result.instruction || ''
            };

        } catch (e) {
            this.logger.error('Generate prompt error:', e);
            throw new HttpException(
                e.message || 'Failed to generate prompt',
                e.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async getAssistantById(id: string | number) {
        return this.getById(Number(id));
    }
}
