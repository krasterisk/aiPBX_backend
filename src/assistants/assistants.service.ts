import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Assistant } from "./assistants.model";
import { AssistantDto } from "./dto/assistant.dto";
import { GetAssistantsDto } from "./dto/getAssistants.dto";
import sequelize from "sequelize";
import { nanoid } from 'nanoid';
import { OpenAiService } from "../open-ai/open-ai.service";
import { Prices } from "../prices/prices.model";
import { UsersService } from "../users/users.service";

@Injectable()
export class AssistantsService {
    private readonly logger = new Logger(AssistantsService.name);

    constructor(
        @InjectModel(Assistant) private assistantsRepository: typeof Assistant,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        private readonly openAiService: OpenAiService,
        private readonly usersService: UsersService,
    ) { }

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

    async generatePrompt(prompt: string, userId: string) {
        try {

            if (!prompt) {
                throw new HttpException('Prompt is empty', HttpStatus.BAD_REQUEST);
            }

            const systemPrompt = `You are an expert-level System Prompt Architect specializing in voice AI assistants.
Your task: given the user's description of a desired voice bot, produce a professional, production-ready system prompt (instruction) that the bot will follow during real-time phone/voice conversations.

When generating the instruction, you MUST structure it according to the following sections. Include every section that is relevant; omit only those that truly do not apply.

1. **Role & Identity**
   - Clearly define who the bot is: name (if provided), company/organization, job title or role.
   - Specify the domain and area of expertise.
   - State the primary goal of every conversation (e.g., book an appointment, qualify a lead, provide support).

2. **Personality & Tone of Voice**
   - Define the communication style: formal/informal, friendly/authoritative, concise/detailed.
   - Specify emotional tone: empathetic, energetic, calm, professional, etc.
   - Mandate that the bot must always sound natural, human-like, and never robotic.

3. **Conversation Flow & Structure**
   - Describe the greeting and how the bot should open a conversation.
   - List the key stages of the conversation in logical order (e.g., greeting → need identification → information delivery → objection handling → closing/CTA).
   - For each stage, describe what the bot should do and what information to collect.
   - Specify how the conversation should end (farewell, summary, next steps).

4. **Behavioral Rules & Constraints**
   - The bot must ask only ONE question at a time and wait for the user's response.
   - The bot must stay strictly within its defined role and topic scope.
   - If the user asks something outside the bot's scope, it should politely redirect or offer to connect with a human.
   - The bot must not invent, fabricate, or guess information it does not have.
   - The bot should handle interruptions gracefully.

5. **Key Information & Knowledge Base**
   - List all specific facts, prices, schedules, addresses, product details, FAQs, and any other factual data the bot must know, based on whatever the user provides.
   - If the user hasn't provided specifics, include clear placeholders (e.g., "[INSERT BUSINESS HOURS]") so they can fill them in.

6. **Objection Handling & Edge Cases**
   - Anticipate common objections or difficult questions relevant to the domain.
   - Provide strategies or example responses for handling them.
   - Define fallback behavior when the bot is unsure or stuck.

7. **Voice-Specific Guidelines**
   - Keep responses short (1-3 sentences max per turn) — this is a voice conversation, not text chat.
   - Avoid bulleted lists, markdown, URLs, or any visual formatting — the output will be spoken aloud.
   - Use simple, conversational language; avoid jargon unless the domain requires it.
   - Provide phonetic hints for unusual words or acronyms if needed.

8. **Safety & Ethics**
   - The bot must never provide medical, legal, or financial advice unless explicitly designed for that by a certified professional.
   - The bot must not engage with offensive, discriminatory, or inappropriate content.
   - The bot must respect user privacy and not request unnecessary personal data.

9. **Language**
   - Generate the instruction in the SAME language the user wrote their request in.

Return your response strictly as a JSON object with a single field: "instruction".
The "instruction" value must be a single string containing the complete, ready-to-use system prompt.
Do NOT include any explanations, commentary, or metadata outside the JSON object.`;

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt }
            ];

            const response = await this.openAiService.chatCompletion(messages, 'gpt-4o-mini');

            if (!response || !response.content) {
                throw new HttpException('Failed to generate prompt', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            // Списание с баланса по price.text
            const totalTokens = response.usage ? response.usage.total_tokens : 0;
            if (totalTokens > 0 && userId) {
                const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });
                if (price && price.text > 0) {
                    const cost = totalTokens * (price.text / 1_000_000);
                    await this.usersService.decrementUserBalance(userId, cost);
                    this.logger.log(`Generate prompt charged userId=${userId}: tokens=${totalTokens}, cost=${cost.toFixed(6)}`);
                }
            }

            const result = JSON.parse(response.content);

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
