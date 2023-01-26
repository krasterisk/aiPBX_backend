import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Permit} from "./permit.model";
import {PermitDto} from "./dto/permit.dto";


@Injectable()
export class PermitsService {
    
    constructor(@InjectModel(Permit) private permitRepository: typeof Permit) {}

    async create(dto: PermitDto) {
        try {
            const permit = await this.permitRepository.create(dto)
            return permit
        } catch (e) {
            throw new HttpException('[permit]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Permit>) {
        const permit = await this.permitRepository.findByPk(updates.id)
        if (!permit) {
            throw new HttpException('permit not found', HttpStatus.NOT_FOUND)
        }
        await permit.update(updates)
        return permit
    }

    async getAll() {
        try {
            const permit = await this.permitRepository.findAll()
            if (permit) {
                return permit
            }

        } catch (e) {
            throw new HttpException({message: '[permit]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.permitRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('permit not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'permit deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getPermitById(id: number) {
        const permit = await this.permitRepository.findOne({where: {id}})
        if(!permit) {
            throw new HttpException('permit not found', HttpStatus.NOT_FOUND)
        } else {
            return permit
        }
    }


}
