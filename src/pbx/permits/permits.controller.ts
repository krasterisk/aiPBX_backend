import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {PermitsService} from "./permits.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Permit} from "./permit.model";
import {PermitDto} from "./dto/permit.dto";


@ApiTags('Permits')
@Controller('permits')
export class PermitsController {
    
    constructor(private permitService: PermitsService) {}
    
    @ApiOperation({summary: "Get permits list"})
    @ApiResponse({status: 200, type: Permit})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.permitService.getAll()
    }

    @ApiOperation({summary: "Get permit by id"})
    @ApiResponse({status: 200, type: [Permit]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.permitService.getPermitById(id)
    }

    @ApiOperation({summary: "Create new permit"})
    @ApiResponse({status: 200, type: Permit})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PermitDto) {
        return this.permitService.create(dto)
    }

    @ApiOperation({summary: "Update permit"})
    @ApiResponse({status: 200, type: Permit})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: PermitDto) {
        return this.permitService.update(dto)
    }

    @ApiOperation({summary: "Delete permit"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.permitService.delete(ids)
    }
    
}
