import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Listbook} from "./listbook.model";
import {ListbookDto} from "./dto/listbook.dto";

@Injectable()
export class ListbookService {
    
    constructor(@InjectModel(Listbook) private listbookRepository: typeof Listbook) {}

    async create(dto: ListbookDto) {
        try {
            const listbook = await this.listbookRepository.create(dto)
            return listbook
        } catch (e) {
            throw new HttpException('[listbook]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Listbook>) {
        const listbook = await this.listbookRepository.findByPk(updates.id)
        if (!listbook) {
            throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
        }
        await listbook.update(updates)
        return listbook
    }

    async getAll() {
        try {
            const listbook = await this.listbookRepository.findAll()
            if (listbook) {
                return listbook
            }

        } catch (e) {
            throw new HttpException({message: '[listbook]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.listbookRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Client deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getListbookById(id: number) {
        const listbook = await this.listbookRepository.findOne({where: {id}})
        if(!listbook) {
            throw new HttpException('Client not found', HttpStatus.NOT_FOUND)
        } else {
            return listbook
        }
    }
}
