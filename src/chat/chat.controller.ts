import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Req,
    Res,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { CreateChatDto, SendMessageDto, UpdateChatDto } from './dto/chat.dto';

@ApiTags('Chat')
@UseGuards(JwtAuthGuard)
@Controller('chats')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    // ── Chat CRUD ───────────────────────────────────────────

    @ApiOperation({ summary: 'Create a chat' })
    @Post()
    async create(@Body() dto: CreateChatDto, @Req() req: any) {
        return this.chatService.create(req.user.id, dto);
    }

    @ApiOperation({ summary: 'List all chats' })
    @Get()
    async getAll(@Req() req: any) {
        return this.chatService.getAll(req.user.id);
    }

    @ApiOperation({ summary: 'Get chat by ID' })
    @Get(':id')
    async getById(@Param('id', ParseIntPipe) id: number) {
        return this.chatService.getById(id);
    }

    @ApiOperation({ summary: 'Update chat' })
    @Put(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateChatDto,
        @Req() req: any,
    ) {
        return this.chatService.update(id, req.user.id, dto);
    }

    @ApiOperation({ summary: 'Delete chat' })
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        await this.chatService.delete(id, req.user.id);
        return { success: true };
    }

    // ── Messaging (SSE) ─────────────────────────────────────

    /**
     * Send a message and receive a streaming response (SSE).
     *
     * SSE events:
     *   - event: text        → chunk of text
     *   - event: tool_call   → { name, arguments }
     *   - event: tool_result → { name, result }
     *   - event: done        → { totalLength }
     *   - event: error       → error message
     */
    @ApiOperation({ summary: 'Send message (SSE streaming response)' })
    @Post(':id/message')
    async sendMessage(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: SendMessageDto,
        @Req() req: any,
        @Res() res: Response,
    ) {
        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const abortController = new AbortController();
        req.on('close', () => abortController.abort());

        try {
            const stream = this.chatService.streamChat(
                id,
                dto.message,
                dto.history || [],
                abortController.signal,
            );

            for await (const event of stream) {
                if (abortController.signal.aborted) break;
                res.write(`event: ${event.type}\n`);
                res.write(`data: ${JSON.stringify(event.data)}\n\n`);
            }
        } catch (err) {
            if (!abortController.signal.aborted) {
                res.write(`event: error\n`);
                res.write(`data: ${JSON.stringify(err.message)}\n\n`);
            }
        } finally {
            res.end();
        }
    }
}
