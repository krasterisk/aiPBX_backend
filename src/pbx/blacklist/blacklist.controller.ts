import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {BlacklistService} from "./blacklist.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Blacklist} from "./blacklist.model";
import {BlacklistDto} from "./dto/blacklist.dto";

@ApiTags('Blacklist')
@Controller('blacklist')
export class BlacklistController {
    
    constructor(private blacklistService: BlacklistService) {}

    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Blacklist})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.blacklistService.getAll()
    }

    @ApiOperation({summary: "Get blacklist by id"})
    @ApiResponse({status: 200, type: [Blacklist]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.blacklistService.getBlacklistById(id)
    }

    @ApiOperation({summary: "Create new blacklist"})
    @ApiResponse({status: 200, type: Blacklist})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: BlacklistDto) {
        return this.blacklistService.create(dto)
    }

    @ApiOperation({summary: "Update blacklist"})
    @ApiResponse({status: 200, type: Blacklist})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: BlacklistDto) {
        return this.blacklistService.update(dto)
    }

    @ApiOperation({summary: "Delete blacklist"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.blacklistService.delete(ids)
    }
    
    
}
