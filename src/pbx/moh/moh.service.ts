import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Moh} from "./moh.model";
import {MohDto} from "./dto/moh.dto";

@Injectable()
export class MohService {
    
    constructor(@InjectModel(Moh) private mohRepository: typeof Moh) {}

    async create(dto: MohDto) {
        try {
            const moh = await this.mohRepository.create(dto)
            return moh
        } catch (e) {
            throw new HttpException('[moh]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Moh>) {
        const moh = await this.mohRepository.findByPk(updates.id)
        if (!moh) {
            throw new HttpException('moh not found', HttpStatus.NOT_FOUND)
        }
        await moh.update(updates)
        return moh
    }

    async getAll() {
        try {
            const moh = await this.mohRepository.findAll()
            if (moh) {
                return moh
            }

        } catch (e) {
            throw new HttpException({message: '[moh]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.mohRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('moh not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'moh deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getMohById(id: number) {
        const moh = await this.mohRepository.findOne({where: {id}})
        if(!moh) {
            throw new HttpException('moh not found', HttpStatus.NOT_FOUND)
        } else {
            return moh
        }
    }


}
