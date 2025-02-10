import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {CreateRoleDto} from "./dto/create-role.dto";
import {InjectModel} from "@nestjs/sequelize";
import {Role} from "./roles.model";

@Injectable()
export class RolesService {

    constructor(@InjectModel(Role) private roleRepository: typeof Role) {}

    async createRole(dto: CreateRoleDto) {
        try {
            const role = await this.roleRepository.create(dto)
            return role
        } catch (e) {
            console.log(e)
            throw new HttpException('[Roles]: Request error! Role not found!', HttpStatus.BAD_REQUEST)
        }
    }

    async getRoleByValue(value: string) {
        try {
            const role = await this.roleRepository.findOne({where: {value}})
            return role
        } catch (e) {
            throw new HttpException('[Roles]: Request error! Role not found!'+e, HttpStatus.BAD_REQUEST)
        }
    }

    async getAll() {
        const roles = await this.roleRepository.findAll()
        return roles
    }

}
