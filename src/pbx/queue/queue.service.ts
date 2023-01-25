import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Queue} from "./queue.model";
import {QueueDto} from "./dto/queue.dto";

@Injectable()
export class QueueService {
    
    constructor(@InjectModel(Queue) private queueRepository: typeof Queue) {}

    async create(dto: QueueDto) {
        try {
            const queue = await this.queueRepository.create(dto)
            return queue
        } catch (e) {
            throw new HttpException('[queue]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Queue>) {
        const queue = await this.queueRepository.findByPk(updates.id)
        if (!queue) {
            throw new HttpException('queue not found', HttpStatus.NOT_FOUND)
        }
        await queue.update(updates)
        return queue
    }

    async getAll() {
        try {
            const queue = await this.queueRepository.findAll()
            if (queue) {
                return queue
            }

        } catch (e) {
            throw new HttpException({message: '[queue]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.queueRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('queue not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'queue deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getQueueById(id: number) {
        const queue = await this.queueRepository.findOne({where: {id}})
        if(!queue) {
            throw new HttpException('queue not found', HttpStatus.NOT_FOUND)
        } else {
            return queue
        }
    }


}
