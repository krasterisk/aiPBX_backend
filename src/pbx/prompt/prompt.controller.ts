import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {PromptService} from "./prompt.service";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Prompt} from "./prompt.model";
import {PromptDto} from "./dto/prompt.dto";


@ApiTags('Prompt')
@Controller('prompt')
export class PromptController {
    
    constructor(private promptService: PromptService) {}

    @ApiOperation({summary: "Get prompts list"})
    @ApiResponse({status: 200, type: Prompt})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.promptService.getAll()
    }

    @ApiOperation({summary: "Get prompt by id"})
    @ApiResponse({status: 200, type: [Prompt]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.promptService.getPromptById(id)
    }

    @ApiOperation({summary: "Create new prompt"})
    @ApiResponse({status: 200, type: Prompt})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: PromptDto) {
        return this.promptService.create(dto)
    }

    @ApiOperation({summary: "Update prompt"})
    @ApiResponse({status: 200, type: Prompt})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: PromptDto) {
        return this.promptService.update(dto)
    }

    @ApiOperation({summary: "Delete prompt"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.promptService.delete(ids)
    }
}
