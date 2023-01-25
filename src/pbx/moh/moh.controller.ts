import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {MohService} from "./moh.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Moh} from "./moh.model";
import {MohDto} from "./dto/moh.dto";

@ApiTags('Music on hold')
@Controller('moh')
export class MohController {
    
    constructor(private mohService: MohService) {}

    @ApiOperation({summary: "Get moh list"})
    @ApiResponse({status: 200, type: Moh})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.mohService.getAll()
    }

    @ApiOperation({summary: "Get moh by id"})
    @ApiResponse({status: 200, type: [Moh]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.mohService.getMohById(id)
    }

    @ApiOperation({summary: "Create new moh"})
    @ApiResponse({status: 200, type: Moh})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: MohDto) {
        return this.mohService.create(dto)
    }

    @ApiOperation({summary: "Update moh"})
    @ApiResponse({status: 200, type: Moh})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: MohDto) {
        return this.mohService.update(dto)
    }

    @ApiOperation({summary: "Delete moh"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.mohService.delete(ids)
    }
    
}
