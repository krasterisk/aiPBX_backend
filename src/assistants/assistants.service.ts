import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Assistant} from "./assistants.model";
import {AssistantDto} from "./dto/assistant.dto";
import {GetAssistantsDto} from "./dto/getAssistants.dto";
import sequelize from "sequelize";

@Injectable()
export class AssistantsService {
    private readonly logger = new Logger(AssistantsService.name);

    constructor(@InjectModel(Assistant) private assistantsRepository: typeof Assistant) {}

    async create(dto: AssistantDto[], isAdmin: boolean, userId: string) {
        try {
            const assistants = [];
            for(const assistant of dto) {
                if(!assistant.userId) {
                    assistant.userId = Number(userId)
                }

                const result = await this.assistantsRepository.create(assistant)

                if(result && assistant.tools.length) {
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

    async update(updates: Partial<Assistant>) {
        try {
            const assistant = await this.assistantsRepository.findByPk(updates.id)
            if (!assistant) {
                throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
            }
            await assistant.update(updates)

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
            throw new HttpException('[Assistant]:  Request error' +e, HttpStatus.BAD_REQUEST)

        }
    }

    async delete(id: string) {
        try {
            await this.assistantsRepository.destroy({where: {id: id}})
            return {message: 'Assistant deleted successfully', statusCode: HttpStatus.OK}
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

            if(!userId && !isAdmin) {
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

            console.log("USERID: ",userId)
            // Conditionally add the userId condition if userId is provided and isAdmin is false
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
                        attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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
                        attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
                    }
                ]
            })
            if (assistant) {
                return assistant
            }
        } catch (e) {
            throw new HttpException({message: '[Assistant]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const assistant = await this.assistantsRepository.findOne({
            where: {id},
            include: [
                {
                    all: true,
                    attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
                }
            ]
        })
        if(!assistant) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        } else {
            return assistant
        }
    }

}
