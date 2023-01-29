import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Webhook} from "./webhook.model";
import {WebhookDto} from "./dto/webhook.dto";

class leak {

}

const leaks = []

@Injectable()
export class WebhooksService {
    
    constructor(@InjectModel(Webhook) private webhookRepository: typeof Webhook) {}

    async create(dto: WebhookDto) {
        try {
            const webhook = await this.webhookRepository.create(dto)
            return webhook
        } catch (e) {
            throw new HttpException('[webhook]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Webhook>) {
        const webhook = await this.webhookRepository.findByPk(updates.id)
        if (!webhook) {
            throw new HttpException('webhook not found', HttpStatus.NOT_FOUND)
        }
        await webhook.update(updates)
        return webhook
    }

    async getAll() {
        leaks.push(new leak())
        try {
            const webhook = await this.webhookRepository.findAll()
            if (webhook) {
                return webhook
            }

        } catch (e) {
            throw new HttpException({message: '[webhook]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.webhookRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('webhook not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'webhook deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getTimeGroupById(id: number) {
        const webhook = await this.webhookRepository.findOne({where: {id}})
        if(!webhook) {
            throw new HttpException('webhook not found', HttpStatus.NOT_FOUND)
        } else {
            return webhook
        }
    }


}
