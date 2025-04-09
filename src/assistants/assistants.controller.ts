import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {AssistantsService} from "./assistants.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {Assistant} from "./assistants.model";
import {AssistantDto} from "./dto/assistant.dto";

@Controller('assistants')
export class AssistantsController {

    constructor(private assistantsService: AssistantsService) {}

    @ApiOperation({summary: "assistants list"})
    @ApiResponse({status: 200, type: Assistant})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.assistantsService.getAll()
    }

    @ApiOperation({summary: "Get assistant by id"})
    @ApiResponse({status: 200, type: [Assistant]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.assistantsService.getById(id)
    }

    @ApiOperation({summary: "Create assistant"})
    @ApiResponse({status: 200, type: Assistant})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: AssistantDto) {
        return this.assistantsService.create(dto)
    }

    @ApiOperation({summary: "Update assistant"})
    @ApiResponse({status: 200, type: Assistant})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: AssistantDto) {
        return this.assistantsService.update(dto)
    }

    @ApiOperation({summary: "Delete assistant"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.assistantsService.delete(ids)
    }
}
