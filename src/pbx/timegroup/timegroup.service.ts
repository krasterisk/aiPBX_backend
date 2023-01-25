import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Timegroup} from "./timegroup.model";
import {TimegroupDto} from "./dto/timegroup.dto";

@Injectable()
export class TimegroupService {
    
    constructor(@InjectModel(Timegroup) private timegroupRepository: typeof Timegroup) {}

    async create(dto: TimegroupDto) {
        try {
            const timegroup = await this.timegroupRepository.create(dto)
            return timegroup
        } catch (e) {
            throw new HttpException('[timegroup]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Timegroup>) {
        const timegroup = await this.timegroupRepository.findByPk(updates.id)
        if (!timegroup) {
            throw new HttpException('timegroup not found', HttpStatus.NOT_FOUND)
        }
        await timegroup.update(updates)
        return timegroup
    }

    async getAll() {
        try {
            const timegroup = await this.timegroupRepository.findAll()
            if (timegroup) {
                return timegroup
            }

        } catch (e) {
            throw new HttpException({message: '[timegroup]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.timegroupRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('timegroup not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'timegroup deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getTimeGroupById(id: number) {
        const timegroup = await this.timegroupRepository.findOne({where: {id}})
        if(!timegroup) {
            throw new HttpException('timegroup not found', HttpStatus.NOT_FOUND)
        } else {
            return timegroup
        }
    }

}
