import {Body, Controller, Delete, Get, Post, Put, UseGuards} from '@nestjs/common';
import {ContextsService} from "./contexts.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {Context} from "./contexts.model";
import {ContextsDto} from "./dto/contexts.dto";

@Controller('contexts')
export class ContextsController {

    constructor(private ContextService: ContextsService) {}

    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.ContextService.getAll()
    }

    @ApiOperation({summary: "Создание кабинета пользователя"})
    @ApiResponse({status: 200, type: Context})
    @Roles('VPBX_ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ContextsDto) {
        return this.ContextService.create(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ContextsDto) {
        return this.ContextService.update(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.ContextService.delete(ids)
    }

}
