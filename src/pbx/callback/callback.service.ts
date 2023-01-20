import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Callback} from "./callback.model";
import {CallbackDto} from "./dto/callback.dto";

@Injectable()
export class CallbackService {
    
    constructor(@InjectModel(Callback) private callbackRepository: typeof Callback) {}

    async create(dto: CallbackDto) {
        try {
            const callback = await this.callbackRepository.create(dto)
            return callback
        } catch (e) {
            throw new HttpException('[callback]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Callback>) {
        const callback = await this.callbackRepository.findByPk(updates.id)
        if (!callback) {
            throw new HttpException('Callback not found', HttpStatus.NOT_FOUND)
        }
        await callback.update(updates)
        return callback
    }

    async getAll() {
        try {
            const callback = await this.callbackRepository.findAll()
            if (callback) {
                return callback
            }

        } catch (e) {
            throw new HttpException({message: '[callback]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.callbackRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Client deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getCallbackById(id: number) {
        const callback = await this.callbackRepository.findOne({where: {id}})
        if(!callback) {
            throw new HttpException('Callback not found', HttpStatus.NOT_FOUND)
        } else {
            return callback
        }
    }
    
}
