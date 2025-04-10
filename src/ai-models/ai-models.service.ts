import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {aiModel} from "./ai-models.model";
import {AiModelDto} from "./dto/ai-model.dto";

@Injectable()
export class AiModelsService {

    constructor(@InjectModel(aiModel) private aiModelsRepository: typeof aiModel) {}

    async create(dto: AiModelDto) {
        try {
            const aiModel = await this.aiModelsRepository.create(dto)
            return aiModel
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiModel already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiModel]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<aiModel>) {
        const aiModel = await this.aiModelsRepository.findByPk(updates.id)
        if (!aiModel) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        }
        await aiModel.update(updates)
        return aiModel
    }

    async delete(ids: number[]) {
        const deleted = await this.aiModelsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'AiModel deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const aiModel = await this.aiModelsRepository.findAll()
            if (aiModel) {
                return aiModel
            }

        } catch (e) {
            throw new HttpException({message: '[AiModel]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const aiModel = await this.aiModelsRepository.findOne({where: {id}})
        if(!aiModel) {
            throw new HttpException('AiModel not found', HttpStatus.NOT_FOUND)
        } else {
            return aiModel
        }
    }

}

