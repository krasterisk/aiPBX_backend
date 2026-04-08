import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, UploadedFile, UseInterceptors, ParseIntPipe, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AssistantsService } from "./assistants.service";
import { ApiOperation, ApiResponse, ApiConsumes } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { Assistant } from "./assistants.model";
import { AssistantDto } from "./dto/assistant.dto";
import { GetAssistantsDto } from "./dto/getAssistants.dto";
import { LoggerService } from "../logger/logger.service";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}
@Controller('assistants')
export class AssistantsController {

    constructor(private assistantsService: AssistantsService,
        private loggerService: LoggerService) { }

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
    async create(@Body() dto: AssistantDto[],
        @Req() request: RequestWithUser
    ) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        const result = await this.assistantsService.create(dto, isAdmin, userId)
        await this.loggerService.logAction(Number(userId), 'create', 'assistant', null, `Created assistant(s)`, null, dto, request);
        return result;
    }

    @ApiOperation({ summary: "Update assistant" })
    @ApiResponse({ status: 200, type: Assistant })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch()
    async update(@Body() dto: AssistantDto, @Req() request: RequestWithUser) {
        const result = await this.assistantsService.update(dto)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'update', 'assistant', (dto as any).id, `Updated assistant`, null, dto, request);
        return result;
    }

    @ApiOperation({ summary: "Delete assistant" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    async delete(@Param('id') id: string, @Req() request: RequestWithUser) {
        const result = await this.assistantsService.delete(id)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'delete', 'assistant', Number(id), `Deleted assistant #${id}`, null, null, request);
        return result;
    }

    @ApiOperation({ summary: "Generate prompt using AI" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('generate-prompt')
    generatePrompt(@Body('prompt') prompt: string, @Req() request: RequestWithUser) {
        const userId = request.tokenUserId
        return this.assistantsService.generatePrompt(prompt, userId)
    }

    @ApiOperation({ summary: "Upload TTS voice reference file" })
    @ApiConsumes('multipart/form-data')
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('/:id/tts-voice')
    @UseInterceptors(FileInterceptor('file'))
    async uploadTtsVoice(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
                    new FileTypeValidator({ fileType: 'audio/wav' }),
                ],
            }),
        ) file: any,
        @Req() request: RequestWithUser
    ) {
        const isAdmin = request.isAdmin;
        const tokenUserId = request.tokenUserId;
        const result = await this.assistantsService.uploadTtsVoice(id, file, isAdmin, tokenUserId);
        await this.loggerService.logAction(Number(tokenUserId), 'update', 'assistant', id, `Uploaded custom TTS voice for assistant #${id}`, null, { file: file.originalname }, request);
        return result;
    }
}
