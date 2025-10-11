import {Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {PbxServersService} from "./pbx-servers.service";
import {PbxServers} from "./pbx-servers.model";
import {GetPbxDto} from "./dto/getPbx.dto";
import {PbxDto} from "./dto/pbx.dto";

@Controller('pbx-servers')
export class PbxServersController {

    constructor(private pbxServersService: PbxServersService) {}

    @ApiOperation({summary: "pbx list"})
    @ApiResponse({status: 200, type: PbxServers})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.pbxServersService.getAll()
    }

    @ApiOperation({summary: "pbxServers list page"})
    @ApiResponse({status: 200, type: PbxServers})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetPbxDto) {
        return this.pbxServersService.get(query)
    }


    @ApiOperation({summary: "Get pbx by id"})
    @ApiResponse({status: 200, type: [PbxServers]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.pbxServersService.getById(id)
    }

    @ApiOperation({summary: "Create assistant"})
    @ApiResponse({status: 200, type: PbxServers})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PbxDto) {
        return this.pbxServersService.create(dto)
    }

    @ApiOperation({summary: "Update pbx"})
    @ApiResponse({status: 200, type: PbxServers})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: PbxDto) {
        return this.pbxServersService.update(dto)
    }

    @ApiOperation({summary: "Delete pbx"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.pbxServersService.delete(id)
    }
}
