import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {TimegroupService} from "./timegroup.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Timegroup} from "./timegroup.model";
import {TimegroupDto} from "./dto/timegroup.dto";

@ApiTags('Time Groups')
@Controller('timegroup')
export class TimegroupController {
    
    constructor(private timegroupService: TimegroupService) {}

    @ApiOperation({summary: "Get timegroups list"})
    @ApiResponse({status: 200, type: Timegroup})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.timegroupService.getAll()
    }

    @ApiOperation({summary: "Get timegroup by id"})
    @ApiResponse({status: 200, type: [Timegroup]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.timegroupService.getTimeGroupById(id)
    }

    @ApiOperation({summary: "Create new timegroup"})
    @ApiResponse({status: 200, type: Timegroup})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: TimegroupDto) {
        return this.timegroupService.create(dto)
    }

    @ApiOperation({summary: "Update timegroup"})
    @ApiResponse({status: 200, type: Timegroup})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: TimegroupDto) {
        return this.timegroupService.update(dto)
    }

    @ApiOperation({summary: "Delete timegroup"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.timegroupService.delete(ids)
    }
}
