import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {AiBot} from "./aibot.model";
import {AiBotDto} from "./dto/aiBot.dto";

@Injectable()
export class aiBotsService {

    constructor(@InjectModel(AiBot) private aiBotsRepository: typeof AiBot) {}

    async create(dto: AiBotDto) {
        try {
            const aiBot = await this.aiBotsRepository.create(dto)
            return aiBot
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('AiBot already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[AiBot]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<AiBot>) {
        const aiBot = await this.aiBotsRepository.findByPk(updates.id)
        if (!aiBot) {
            throw new HttpException('AiBot not found', HttpStatus.NOT_FOUND)
        }
        await aiBot.update(updates)
        return aiBot
    }

    async delete(ids: number[]) {
        const deleted = await this.aiBotsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('AiBot not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'AiBot deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const aiBot = await this.aiBotsRepository.findAll()
            if (aiBot) {
                return aiBot
            }

        } catch (e) {
            throw new HttpException({message: '[AiBot]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getById(id: number) {
        const aiBot = await this.aiBotsRepository.findOne({where: {id}})
        if(!aiBot) {
            throw new HttpException('AiBot not found', HttpStatus.NOT_FOUND)
        } else {
            return aiBot
        }
    }

}
