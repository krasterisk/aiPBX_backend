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
            throw new HttpException('Ошибка ввода данных в модуле contexts' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Context>) {
        const context = await this.contextsRepository.findByPk(updates.id)
        if (!context) {
            throw new HttpException('Контекст не найден', HttpStatus.NOT_FOUND)
        }
        await context.update(updates)
        return context
    }

    async delete(ids: number[]) {
        const deleted = await this.contextsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Контекст не найден', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Контекст удалён успешно', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const context = await this.contextsRepository.findAll()
            if (context) {
                return context
            }

        } catch (e) {
            throw new HttpException({message: 'Ошибка в запросе в модуле Context: '} +e, HttpStatus.BAD_REQUEST)
        }
    }

}
