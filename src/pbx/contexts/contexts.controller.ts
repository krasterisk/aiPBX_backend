import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ContextsService} from "./contexts.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Context} from "./contexts.model";
import {ContextsDto} from "./dto/contexts.dto";

@ApiTags('Context')
@Controller('contexts')
export class ContextsController {

    constructor(private ContextService: ContextsService) {}

    @ApiOperation({summary: "Contexts list"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.ContextService.getAll()
    }

    @ApiOperation({summary: "Get context by id"})
    @ApiResponse({status: 200, type: [Context]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.ContextService.getContextById(id)
    }

    @ApiOperation({summary: "Create context"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ContextsDto) {
        return this.ContextService.create(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ContextsDto) {
        return this.ContextService.update(dto)
    }

    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.ContextService.delete(ids)
    }

}
