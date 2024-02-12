import {HttpException, HttpStatus } from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Prompt} from "./prompt.model";
import {PromptDto} from "./dto/prompt.dto";

export class PromptService {

    constructor(@InjectModel(Prompt) private promptRepository: typeof Prompt) {}

    async create(dto: PromptDto) {
        try {
            const prompt = await this.promptRepository.create(dto)
            return prompt
        } catch (e) {
            throw new HttpException('[prompt]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Prompt>) {
        const prompt = await this.promptRepository.findByPk(updates.id)
        if (!prompt) {
            throw new HttpException('prompt not found', HttpStatus.NOT_FOUND)
        }
        await prompt.update(updates)
        return prompt
    }

    async getAll() {
        try {
            const prompt = await this.promptRepository.findAll()
            if (prompt) {
                return prompt
            }

        } catch (e) {
            throw new HttpException({message: '[prompt]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.promptRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('prompt not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'prompt deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getPromptById(id: number) {
        const prompt = await this.promptRepository.findOne({where: {id}})
        if(!prompt) {
            throw new HttpException('prompt not found', HttpStatus.NOT_FOUND)
        } else {
            return prompt
        }
    }

}
