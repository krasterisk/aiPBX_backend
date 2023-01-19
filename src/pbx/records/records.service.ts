import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Record} from "./record.model";
import {RecordDto} from "./dto/record.dto";

@Injectable()
export class RecordsService {

    constructor(@InjectModel(Record) private RecordsRepository: typeof Record){}

    async create(dto: RecordDto) {
        try {
            const record = await this.RecordsRepository.create(dto)
            return record
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Record already exists', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Records]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Record>) {
        const record = await this.RecordsRepository.findByPk(updates.id)
        if (!record) {
            throw new HttpException('Record not found', HttpStatus.NOT_FOUND)
        }
        await record.update(updates)
        return record
    }

    async delete(ids: number[]) {
        const deleted = await this.RecordsRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Record not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Record deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getAll() {
        try {
            const record = await this.RecordsRepository.findAll()
            if (record) {
                return record
            }

        } catch (e) {
            throw new HttpException({message: '[Records]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async getRecordById(id: number) {
        const record = await this.RecordsRepository.findOne({where: {id}})
        if(!record) {
            throw new HttpException('Record not found', HttpStatus.NOT_FOUND)
        } else {
            return record
        }
    }

}
