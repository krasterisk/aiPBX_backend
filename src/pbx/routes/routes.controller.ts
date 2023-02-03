import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {RoutesService} from "./routes.service";
import {RoutesDto} from "./dto/routes.dto";
import {Route} from "./routes.model";

@ApiTags('Routes')
@Controller('routes')
export class RoutesController {

    constructor(private RouteService: RoutesService) {}


    @ApiOperation({summary: "Get routes list"})
    @ApiResponse({status: 200, type: Route})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.RouteService.getAll()
    }

    @ApiOperation({summary: "Get Route by id"})
    @ApiResponse({status: 200, type: [Route]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.RouteService.getRouteById(id)
    }

    @ApiOperation({summary: "Create route"})
    @ApiResponse({status: 200, type: Route})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: RoutesDto) {
        return this.RouteService.create(dto)
    }

    @ApiOperation({summary: "Update route"})
    @ApiResponse({status: 200, type: Route})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() updates: Partial<Route>) {
        return this.RouteService.update(updates)
    }

    @ApiOperation({summary: "Delete route"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.RouteService.delete(ids)
    }


}
