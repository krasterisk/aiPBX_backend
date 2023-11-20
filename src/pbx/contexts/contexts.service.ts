import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Context} from "./contexts.model";
import {ContextsDto} from "./dto/contexts.dto";

@Injectable()
export class ContextsService {

    constructor(@InjectModel(Context) private contextsRepository: typeof Context) {}

    async create(dtos: ContextsDto[]) {
        try {
            const contexts = []
            for (const context of dtos) {
                const result = await this.contextsRepository.create(context)
                contexts.push(result)
            }
            return contexts
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

    async delete(id: string) {
        try {
            await this.contextsRepository.destroy({where: { id } })
            return {message: 'Context deleted successfully', statusCode: HttpStatus.OK}

        } catch (e) {
            throw new HttpException('[Contexts] Context delete error!' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAll(vpbx_user_id: string) {
        try {
            if(!vpbx_user_id) {
                throw new HttpException({message: '[Contexts]:  vpbx_user_id must be set'}, HttpStatus.BAD_REQUEST)
            }
            const context = await this.contextsRepository.findAll({where: {vpbx_user_id}})
            if (context) {
                return context
            }

        } catch (e) {
            throw new HttpException({message: '[Contexts]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAllById(vpbx_user_id: string) {
        try {
            if(!vpbx_user_id) {
                throw new HttpException({message: '[Contexts]:  vpbx_user_id must be set'}, HttpStatus.BAD_REQUEST)
            }
            const context = await this.contextsRepository.findAll({where: {vpbx_user_id}})
            if (context) {
                return context
            }

        } catch (e) {
            throw new HttpException({message: '[Contexts]:  Request error'} + e, HttpStatus.BAD_REQUEST)
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
