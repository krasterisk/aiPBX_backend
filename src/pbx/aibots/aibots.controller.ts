import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {aiBotsService} from "./aibots.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {AiBot} from "./aibot.model";
import {AiBotDto} from "./dto/aiBot.dto";

@Controller('aiBots')
export class aiBotsController {

    constructor(private AiBotService: aiBotsService) {}

    @ApiOperation({summary: "aiBots list"})
    @ApiResponse({status: 200, type: AiBot})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.AiBotService.getAll()
    }

    @ApiOperation({summary: "Get aiBot by id"})
    @ApiResponse({status: 200, type: [AiBot]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.AiBotService.getById(id)
    }

    @ApiOperation({summary: "Create aiBot"})
    @ApiResponse({status: 200, type: AiBot})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: AiBotDto) {
        return this.AiBotService.create(dto)
    }

    @ApiOperation({summary: "Update aiBot"})
    @ApiResponse({status: 200, type: AiBot})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: AiBotDto) {
        return this.AiBotService.update(dto)
    }

    @ApiOperation({summary: "Delete aiBot"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.AiBotService.delete(ids)
    }
}
