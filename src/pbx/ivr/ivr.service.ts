import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Ivr} from "./ivr.model";
import {IvrDto} from "./dto/ivr.dto";

@Injectable()
export class IvrService {
    
    constructor(@InjectModel(Ivr) private ivrRepository: typeof Ivr) {}

    async create(dto: IvrDto) {
        try {
            const ivr = await this.ivrRepository.create(dto)
            return ivr
        } catch (e) {
            throw new HttpException('[ivr]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Ivr>) {
        const ivr = await this.ivrRepository.findByPk(updates.id)
        if (!ivr) {
            throw new HttpException('ivr not found', HttpStatus.NOT_FOUND)
        }
        await ivr.update(updates)
        return ivr
    }

    async getAll() {
        try {
            const ivr = await this.ivrRepository.findAll()
            if (ivr) {
                return ivr
            }

        } catch (e) {
            throw new HttpException({message: '[ivr]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.ivrRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('ivr not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'ivr deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getIvrById(id: number) {
        const ivr = await this.ivrRepository.findOne({where: {id}})
        if(!ivr) {
            throw new HttpException('ivr not found', HttpStatus.NOT_FOUND)
        } else {
            return ivr
        }
    }
    
}
