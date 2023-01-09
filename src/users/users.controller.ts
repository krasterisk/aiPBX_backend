import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards, UsePipes} from '@nestjs/common';
import {UsersService} from "./users.service";
import {CreateUserDto} from "./dto/create-user.dto";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {User} from "./users.model";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {AddRoleDto} from "./dto/add-role.dto";
import {BanUserDto} from "./dto/ban-user.dto";
import {ValidationPipe} from "../pipes/validation.pipe";

@Controller('users')
export class UsersController {

    constructor(private userService: UsersService) {}

    @ApiOperation({summary: "Создание пользователя"})
    @ApiResponse({status: 200, type: User})
//    @UsePipes(ValidationPipe)
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.userService.createUser(dto)
    }

    @ApiOperation({summary: "Получить всех пользователей"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.userService.getAllUsers()
    }

    @ApiOperation({summary: "Получить всех пользователей"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.userService.getUserById(id)
    }

    @ApiOperation({summary: "Выдать роль"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/add')
    addRole(@Body() dto: AddRoleDto) {
        return this.userService.addRole(dto)
    }

    @ApiOperation({summary: "Забрать роль"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/remove')
    removeRole(@Body() dto: AddRoleDto) {
        return this.userService.removeRole(dto)
    }

    @ApiOperation({summary: "Забанить пользователя"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/ban')
    banUser(@Body() dto: BanUserDto) {
        return this.userService.banUser(dto)
    }

    @ApiOperation({summary: "Редактировать пользователя"})
    @ApiResponse({status: 200, type: User})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    UpdateUser(@Body() updates: Partial<User>) {
        return this.userService.updateUser(updates)
    }

    @ApiOperation({summary: "Удаление пользователей"})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    DeleteUser(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.userService.deleteUser(ids)
    }


}