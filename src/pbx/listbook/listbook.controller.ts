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

    @ApiOperation({summary: "Get listbook list"})
    @ApiResponse({status: 200, type: Listbook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.listbookService.getAll()
    }

    @ApiOperation({summary: "Get listbook by id"})
    @ApiResponse({status: 200, type: [Listbook]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.listbookService.getListbookById(id)
    }

    @ApiOperation({summary: "Create new listbook"})
    @ApiResponse({status: 200, type: Listbook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ListbookDto) {
        return this.listbookService.create(dto)
    }

    @ApiOperation({summary: "Update listbook"})
    @ApiResponse({status: 200, type: Listbook})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ListbookDto) {
        return this.listbookService.update(dto)
    }

    @ApiOperation({summary: "Delete listbook"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.listbookService.delete(ids)
    }

}
