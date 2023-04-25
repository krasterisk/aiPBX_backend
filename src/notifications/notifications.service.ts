import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Notifications} from "./notifications.model";
import {NotificationsDto} from "./dto/notifications.dto";

@Injectable()
export class NotificationsService {

    constructor(@InjectModel(Notifications) private notificationsRepository: typeof Notifications) {}

    async create(dto: NotificationsDto) {
        try {
            const notifications = await this.notificationsRepository.create(dto)
            return notifications
        } catch (e) {
            throw new HttpException('[notifications]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Notifications>) {
        const notifications = await this.notificationsRepository.findByPk(updates.id)
        if (!notifications) {
            throw new HttpException('notifications not found', HttpStatus.NOT_FOUND)
        }
        await notifications.update(updates)
        return notifications
    }

    async getAll() {
        try {
            const notifications = await this.notificationsRepository.findAll()
            if (notifications) {
                return notifications
            }

        } catch (e) {
            throw new HttpException({message: '[notifications]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.notificationsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Notifications not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Notifications deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getNotificationsById(id: number) {
        const notifications = await this.notificationsRepository.findOne({where: {id}})
        if(!notifications) {
            throw new HttpException('notifications not found', HttpStatus.NOT_FOUND)
        } else {
            return notifications
        }
    }

}
