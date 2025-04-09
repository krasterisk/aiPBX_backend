import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Assistant} from "./assistants.model";
import {AssistantDto} from "./dto/assistant.dto";

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
