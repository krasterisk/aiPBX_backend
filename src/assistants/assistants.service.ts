import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Assistant} from "./assistants.model";
import {AssistantDto} from "./dto/assistant.dto";
import {GetAssistantsDto} from "./dto/getAssistants.dto";
import sequelize from "sequelize";

@Injectable()
export class AssistantsService {

    constructor(@InjectModel(Assistant) private assistantsRepository: typeof Assistant) {}

    async create(dto: AssistantDto) {
        try {
            const assistant = await this.assistantsRepository.create(dto)
            return assistant
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Assistant already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Assistant]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Assistant>) {
        const assistant = await this.assistantsRepository.findByPk(updates.id)
        if (!assistant) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        }
        await assistant.update(updates)
        return assistant
    }

    async delete(ids: number[]) {
        const deleted = await this.assistantsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Assistant deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async get(query: GetAssistantsDto, isAdmin: boolean) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const offset = (page - 1) * limit;
            const search = query.search;

            const userId = !query.userId && isAdmin ? undefined : Number(query.userId);

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
            // Conditionally add the userId condition if userId is provided and isAdmin is false
            if (userId !== undefined) {
                whereClause.userId = userId;
            }

            const assistants = await this.assistantsRepository.findAndCountAll({
                offset,
                limit,
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
            throw new HttpException({ message: "[Casks]: Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }

    async getAll() {
        try {
            const assistant = await this.assistantsRepository.findAll()
            if (assistant) {
                return assistant
            }

        } catch (e) {
            throw new HttpException({message: '[Assistant]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const assistant = await this.assistantsRepository.findOne({where: {id}})
        if(!assistant) {
            throw new HttpException('Assistant not found', HttpStatus.NOT_FOUND)
        } else {
            return assistant
        }
    }

}
