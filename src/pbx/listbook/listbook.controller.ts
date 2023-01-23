import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ListbookService} from "./listbook.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Listbook} from "./listbook.model";
import {ListbookDto} from "./dto/listbook.dto";

@ApiTags('Listbook')
@Controller('listbook')
export class ListbookController {
    
    constructor(private listbookService: ListbookService) {}

    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Listbook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.listbookService.getAll()
    }

    @ApiOperation({summary: "Get Listbook by id"})
    @ApiResponse({status: 200, type: [Listbook]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.listbookService.getListbookById(id)
    }

    @ApiOperation({summary: "Создание кабинета пользователя"})
    @ApiResponse({status: 200, type: Listbook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ListbookDto) {
        return this.listbookService.create(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ListbookDto) {
        return this.listbookService.update(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.listbookService.delete(ids)
    }



}
