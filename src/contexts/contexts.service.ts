import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Context} from "./contexts.model";
import {ContextsDto} from "./dto/contexts.dto";

@Injectable()
export class ContextsService {

    constructor(@InjectModel(Context) private contextsRepository: typeof Context) {}

    async create(contextDto: ContextsDto) {
        try {
            const context = await this.contextsRepository.create(contextDto)
            return context
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Context already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Contexts]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Context>) {
        const context = await this.contextsRepository.findByPk(updates.id)
        if (!context) {
            throw new HttpException('Context not found', HttpStatus.NOT_FOUND)
        }
        await context.update(updates)
        return context
    }

    async delete(ids: number[]) {
        const deleted = await this.contextsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Context not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Context deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const context = await this.contextsRepository.findAll()
            if (context) {
                return context
            }

        } catch (e) {
            throw new HttpException({message: '[Contexts]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getContextById(id: number) {
        const context = await this.contextsRepository.findOne({where: {id}})
        if(!context) {
            throw new HttpException('Context not found', HttpStatus.NOT_FOUND)
        } else {
            return context
        }
    }

}
