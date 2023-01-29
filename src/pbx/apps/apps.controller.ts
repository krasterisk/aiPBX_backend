import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {AppsService} from "./apps.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {App} from "./app.model";
import {AppDto} from "./dto/app.dto";

@Controller('apps')
export class AppsController {
    
    constructor(private appService: AppsService) {}

    @ApiOperation({summary: "Apps list"})
    @ApiResponse({status: 200, type: App})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.appService.getAll()
    }

    @ApiOperation({summary: "Get app by id"})
    @ApiResponse({status: 200, type: [App]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.appService.getAppById(id)
    }

    @ApiOperation({summary: "Create app"})
    @ApiResponse({status: 200, type: App})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: AppDto) {
        return this.appService.create(dto)
    }

    @ApiOperation({summary: "Update app"})
    @ApiResponse({status: 200, type: App})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: AppDto) {
        return this.appService.update(dto)
    }

    @ApiOperation({summary: "Delete app"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.appService.delete(ids)
    }
    
}
