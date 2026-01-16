import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AssistantsService } from "./assistants.service";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Assistant } from "./assistants.model";
import { AssistantDto } from "./dto/assistant.dto";
import { GetAssistantsDto } from "./dto/getAssistants.dto";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}
@Controller('assistants')
export class AssistantsController {

    constructor(private assistantsService: AssistantsService) { }

    @ApiOperation({ summary: "assistants list" })
    @ApiResponse({ status: 200, type: Assistant })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Get()
    getAll(@Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenUserId = request.vpbxUserId || request.tokenUserId
        const realUserId = !isAdmin && tokenUserId
        return this.assistantsService.getAll(realUserId, isAdmin)
    }

    @ApiOperation({ summary: "Assistants list page" })
    @ApiResponse({ status: 200, type: Assistant })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetAssistantsDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.assistantsService.get(query, isAdmin, userId)
    }


    @ApiOperation({ summary: "Get assistant by id" })
    @ApiResponse({ status: 200, type: [Assistant] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.assistantsService.getById(id)
    }

    @ApiOperation({ summary: "Create assistant" })
    @ApiResponse({ status: 200, type: Assistant })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: AssistantDto[],
        @Req() request: RequestWithUser
    ) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.assistantsService.create(dto, isAdmin, userId)
    }

    @ApiOperation({ summary: "Update assistant" })
    @ApiResponse({ status: 200, type: Assistant })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: AssistantDto) {
        return this.assistantsService.update(dto)
    }

    @ApiOperation({ summary: "Delete assistant" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: string) {
        return this.assistantsService.delete(id)
    }

    @ApiOperation({ summary: "Generate prompt using AI" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('generate-prompt')
    generatePrompt(@Body() dto: { assistantId: string, prompt: string }) {
        return this.assistantsService.generatePrompt(dto.assistantId, dto.prompt)
    }
}
