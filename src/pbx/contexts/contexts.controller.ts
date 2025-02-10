import {Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards} from '@nestjs/common';
import {ContextsService} from "./contexts.service";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Context} from "./contexts.model";
import {ContextsDto} from "./dto/contexts.dto";
import {GetContextsDto} from "./dto/getContexts.dto";

@ApiTags('Context')
@Controller('contexts')
export class ContextsController {

    constructor(private ContextService: ContextsService) {}

    @ApiOperation({summary: "All Contexts list"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll(@Query('vpbx_user_id') vpbx_user_id: string) {
        return this.ContextService.getAll(vpbx_user_id)
    }

    @ApiOperation({summary: "Contexts list page"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetContextsDto ) {
        try {
            return this.ContextService.get(query)

        } catch (e) {
            console.log(e)
        }
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
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ContextsDto[]) {
        return this.ContextService.create(dto)
    }

    @ApiOperation({summary: "Update context"})
    @ApiResponse({status: 200, type: Context})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: ContextsDto) {
        return this.ContextService.update(dto)
    }

    @ApiOperation({summary: "Delete context"})
    @ApiResponse({status: 200})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.ContextService.delete(id)
    }

}
