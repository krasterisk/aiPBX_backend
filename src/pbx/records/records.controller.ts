import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {RecordsService} from "./records.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Record} from "./record.model";
import {RecordDto} from "./dto/record.dto";

@ApiTags('Records')
@Controller('records')
export class RecordsController {

    constructor(private RecordService: RecordsService) {}

    @ApiOperation({summary: "Get records list"})
    @ApiResponse({status: 200, type: Record})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.RecordService.getAll()
    }

    @ApiOperation({summary: "Get Record by id"})
    @ApiResponse({status: 200, type: [Record]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.RecordService.getRecordById(id)
    }

    @ApiOperation({summary: "Create record"})
    @ApiResponse({status: 200, type: Record})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: RecordDto) {
        return this.RecordService.create(dto)
    }

    @ApiOperation({summary: "Edit record"})
    @ApiResponse({status: 200, type: Record})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: RecordDto) {
        return this.RecordService.update(dto)
    }

    @ApiOperation({summary: "Delete record"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.RecordService.delete(ids)
    }


}
