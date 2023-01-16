import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Route} from "../Routes/Routes.model";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {User} from "../../users/users.model";
import {RoutesService} from "./routes.service";
import {RoutesDto} from "./dto/routes.dto";

@Controller('routes')
export class RoutesController {

    constructor(private RouteService: RoutesService) {}


    @ApiOperation({summary: "Вывести список контекстов"})
    @ApiResponse({status: 200, type: Route})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.RouteService.getAll()
    }

    @ApiOperation({summary: "Get Route by id"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.RouteService.getRouteById(id)
    }

    @ApiOperation({summary: "Создание кабинета пользователя"})
    @ApiResponse({status: 200, type: Route})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: RoutesDto) {
        return this.RouteService.create(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() updates: Partial<Route>) {
        return this.RouteService.update(updates)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.RouteService.delete(ids)
    }


}
