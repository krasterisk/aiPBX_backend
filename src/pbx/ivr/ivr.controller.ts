import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {IvrService} from "./ivr.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Ivr} from "./ivr.model";
import {IvrDto} from "./dto/ivr.dto";

@ApiTags('IVR')
@Controller('ivr')
export class IvrController {
    
    constructor(private ivrService: IvrService) {}

    @ApiOperation({summary: "Get IVR list"})
    @ApiResponse({status: 200, type: Ivr})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.ivrService.getAll()
    }

    @ApiOperation({summary: "Get ivr by id"})
    @ApiResponse({status: 200, type: [Ivr]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.ivrService.getIvrById(id)
    }

    @ApiOperation({summary: "Create new ivr"})
    @ApiResponse({status: 200, type: Ivr})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: IvrDto) {
        return this.ivrService.create(dto)
    }

    @ApiOperation({summary: "Edit ivr"})
    @ApiResponse({status: 200, type: Ivr})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: IvrDto) {
        return this.ivrService.update(dto)
    }

    @ApiOperation({summary: "Delete ivr by id"})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.ivrService.delete(ids)
    }
 
}
