import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Blacklist} from "./blacklist.model";
import {BlacklistDto} from "./dto/blacklist.dto";

@Injectable()
export class BlacklistService {
    
    constructor(@InjectModel(Blacklist) private blacklistRepository: typeof Blacklist) {}

    async create(dto: BlacklistDto) {
        try {
            const blacklist = await this.blacklistRepository.create(dto)
            return blacklist
        } catch (e) {
            throw new HttpException('[blacklist]:  Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Blacklist>) {
        const blacklist = await this.blacklistRepository.findByPk(updates.id)
        if (!blacklist) {
            throw new HttpException('blacklist not found', HttpStatus.NOT_FOUND)
        }
        await blacklist.update(updates)
        return blacklist
    }

    async getAll() {
        try {
            const blacklist = await this.blacklistRepository.findAll()
            if (blacklist) {
                return blacklist
            }

        } catch (e) {
            throw new HttpException({message: '[blacklist]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.blacklistRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Blacklist not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Blacklist deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getBlacklistById(id: number) {
        const blacklist = await this.blacklistRepository.findOne({where: {id}})
        if(!blacklist) {
            throw new HttpException('blacklist not found', HttpStatus.NOT_FOUND)
        } else {
            return blacklist
        }
    }
    
}
