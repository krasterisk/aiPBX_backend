import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {App} from "./app.model";
import {AppDto} from "./dto/app.dto";

@Injectable()
export class AppsService {

    constructor(@InjectModel(App) private appsRepository: typeof App) {
    }

    async create(dto: AppDto) {
        try {
            const app = await this.appsRepository.create(dto)
            return app
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Appt already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Appts]:  Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<App>) {
        const app = await this.appsRepository.findByPk(updates.id)
        if (!app) {
            throw new HttpException('Appt not found', HttpStatus.NOT_FOUND)
        }
        await app.update(updates)
        return app
    }

    async delete(ids: number[]) {
        const deleted = await this.appsRepository.destroy({where: {id: ids}})
        if (deleted === 0) {
            throw new HttpException('Appt not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'App deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const app = await this.appsRepository.findAll()
            if (app) {
                return app
            }

        } catch (e) {
            throw new HttpException({message: '[App]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAppById(id: number) {
        const app = await this.appsRepository.findOne({where: {id}})
        if (!app) {
            throw new HttpException('App not found', HttpStatus.NOT_FOUND)
        } else {
            return app
        }
    }
}
