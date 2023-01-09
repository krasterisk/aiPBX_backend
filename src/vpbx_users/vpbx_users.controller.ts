import {Body, Controller, Delete, Get, Post, Put, UseGuards} from '@nestjs/common';
import {VpbxUser} from "./vpbx_users.model";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {VpbxUsersService} from "./vpbx_users.service";
import {CreateVpbxuserDto} from "./dto/create-vpbxuser.dto";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";

@Controller('vpbx-users')
export class VpbxUsersController {
    constructor(private VpbxUserService: VpbxUsersService) {}

    @ApiOperation({summary: "Вывести список кабинетов"})
    @ApiResponse({status: 200, type: VpbxUser})
    @Roles('VPBX_ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.VpbxUserService.getAll()
    }

    @ApiOperation({summary: "Создание кабинета пользователя"})
    @ApiResponse({status: 200, type: VpbxUser})
    @Roles('VPBX_ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: CreateVpbxuserDto) {
        return this.VpbxUserService.create(dto)
    }

    @ApiOperation({summary: "Редактировать кабинет"})
    @ApiResponse({status: 200, type: VpbxUser})
    @Roles('VPBX_ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    Update(@Body() updates: Partial<VpbxUser>) {
        return this.VpbxUserService.update(updates)
    }

    @ApiOperation({summary: "Удаление кабинета"})
    @Roles('VPBX_ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    DeleteUser(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.VpbxUserService.delete(ids)
    }
}
