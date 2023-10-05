import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {User} from "../users/users.model";
import {CreateUserDto} from "./dto/create-user.dto";
import {RolesService} from "../roles/roles.service";
import {AddRoleDto} from "./dto/add-role.dto";
import {BanUserDto} from "./dto/ban-user.dto";

@Injectable()
export class UsersService {

    constructor(@InjectModel(User) private usersRepository: typeof User,
                private roleService: RolesService) {}

    async create(dto: CreateUserDto) {
        try {
            const user = await this.usersRepository.create(dto)
            const role = await this.roleService.getRoleByValue("ADMIN")
            if (role && user) {
                await user.$set('roles', [role.id])
                user.roles = [role]
                return user
            }
            throw new HttpException({message: 'User or Role not found'}, HttpStatus.NOT_FOUND)
        } catch (e) {

            throw new HttpException({message: e+'User or Role not found'}, HttpStatus.NOT_FOUND)

        }
    }

    async getAllUsers() {
        try {
            const user = await this.usersRepository.findAll({include: {all: true}})
            return user
        } catch (e) {
            throw new HttpException('Users not found', HttpStatus.NOT_FOUND)
        }
    }

    async getUserByEmail(email: string) {
        const user = await this.usersRepository.findOne({where: {email}, include: {all: true}})
        return user
    }

    async getUserProfile() {
        try {
            const user = await this.usersRepository.findAll()
            return user[0]
        } catch (e) {
            throw new HttpException('Users not found' + e, HttpStatus.NOT_FOUND)
        }
    }

    async updateUserProfile(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id)
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        }
        await user.update(updates)
        return user
    }

    async getUserByUsername(username: string) {
        try {
            const user = await this.usersRepository.findOne({where: {username}, include: {all: true}})
            return user

        } catch (e) {
            throw new HttpException('User not found' + e, HttpStatus.NOT_FOUND)
        }
    }

    async getUserById(id: number) {
        const user = await this.usersRepository.findOne({where: {id}, include: {all: true}})
        if(!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        } else {
            return user
        }
    }

    async addRole(dto: AddRoleDto) {
        const user = await this.usersRepository.findOne({where: {id: dto.userId}, include: {all: true}})
        const role = await this.roleService.getRoleByValue(dto.value)
        if (role && user) {
            await user.$add('roles', role.id)
            return user.reload()
        }
        throw new HttpException('User or Role not found', HttpStatus.NOT_FOUND)
    }

    async removeRole(dto: AddRoleDto) {
        const user = await this.usersRepository.findOne({where: {id: dto.userId}, include: {all: true}})
        const role = await this.roleService.getRoleByValue(dto.value)
        if (role && user) {
            await user.$remove('roles', role.id)
            return user.reload()
        }
        throw new HttpException('User or Role not found', HttpStatus.NOT_FOUND)
    }

    async banUser(dto: BanUserDto) {
        const user = await this.usersRepository.findByPk(dto.userId)
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        }
        user.banned = true
        user.banReason = dto.banReason
        await user.save()
        return user
    }

    async updateUser(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id)
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        }
        await user.update(updates)
        return user
    }

    async deleteUser(ids: number[]) {
        const deleted = await this.usersRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'User deleted successfully', statusCode: HttpStatus.OK}
        }
    }

}
