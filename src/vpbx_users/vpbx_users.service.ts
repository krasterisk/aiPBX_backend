import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {VpbxUser} from "./vpbx_users.model";
import {UsersService} from "../users/users.service";
import {CreateVpbxuserDto} from "./dto/create-vpbxuser.dto";
import {User} from "../users/users.model";

@Injectable()
export class VpbxUsersService {
    constructor(@InjectModel(VpbxUser) private vpbxUsersRepository: typeof VpbxUser) {}

    async getAll() {
        const vpbxUser = await this.vpbxUsersRepository.findAll()
        if (vpbxUser) {
            return vpbxUser
        }
        throw new HttpException({message: 'Ошибка в запросе'}, HttpStatus.BAD_REQUEST)
    }

    async create(dto: CreateVpbxuserDto) {
        try {
            const vpbxUser = await this.vpbxUsersRepository.create(dto)
            if (vpbxUser) {
                return vpbxUser
            }
            throw new HttpException({message: 'Ошибка в запросе'}, HttpStatus.BAD_REQUEST)
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException({message: 'Такой пользователь уже существует'}, HttpStatus.BAD_REQUEST)
            }
            throw new HttpException({message: 'Ошибка в запросе'}, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.vpbxUsersRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('Кабинет не найден', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'Кабинет удалён успешно', statusCode: HttpStatus.OK}
        }
    }

    async update(updates: Partial<VpbxUser>) {
        const user = await this.vpbxUsersRepository.findByPk(updates.id)
        if (!user) {
            throw new HttpException('Кабинет не найден', HttpStatus.NOT_FOUND)
        }
        await user.update(updates)
        return user
    }


}
