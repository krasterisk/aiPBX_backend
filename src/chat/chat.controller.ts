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
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';
import { ChatService } from './chat.service';
import { CreateChatDto, SendMessageDto, UpdateChatDto } from './dto/chat.dto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequireApiKeyScope, API_KEY_SCOPES } from '../api-keys/api-key-scope.decorator';

// ─── Route-level guards ────────────────────────────────────────────────────────

/**
 * Resolves the effective user ID from either a JWT session or an API key.
 * JWT sets req.user.id (via JwtAuthGuard or RolesGuard).
 * API key sets req.apiKeyUserId (via ApiKeyGuard).
 */
function resolveUserId(req: any): number {
    return req.user?.id ?? req.apiKeyUserId;
}

@ApiTags('Chat')
@Controller('chats')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    // ── Chat CRUD — JWT only ─────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create a chat' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    async create(@Body() dto: CreateChatDto, @Req() req: any) {
        return this.chatService.create(req.tokenUserId, dto);
    }

    @ApiOperation({ summary: 'List all chats' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get()
    async getAll(@Req() req: any) {
        return this.chatService.getAll(Number(req.tokenUserId));
    }

    @ApiOperation({ summary: 'Get chat by ID' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get(':id')
    async getById(@Param('id', ParseIntPipe) id: number) {
        return this.chatService.getById(id);
    }

    @ApiOperation({ summary: 'Update chat' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Put(':id')
    async update(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateChatDto,
        @Req() req: any,
    ) {
        return this.chatService.update(id, Number(req.tokenUserId), dto);
    }

    @ApiOperation({ summary: 'Delete chat' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete(':id')
    async delete(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        await this.chatService.delete(id, Number(req.tokenUserId));
        return { success: true };
    }

    // ── Messaging (SSE) — JWT OR API Key ─────────────────────────────────────

    /**
     * Send a message and receive a streaming response (SSE).
     *
     * Accepts TWO authorization methods:
     *  1. Bearer {JWT}      — regular users via JwtAuthGuard
     *  2. Bearer {API_KEY}  — external services (e.g. KrAsterisk) via ApiKeyGuard
     *
     * The endpoint first tries to authenticate as an API key (fast DB lookup).
     * If the token is not found in api_keys, falls back to JWT verification.
     *
     * SSE events:
     *   - event: text        → chunk of text
     *   - event: tool_call   → { name, arguments }
     *   - event: tool_result → { name, result }
     *   - event: done        → { totalLength }
     *   - event: error       → error message
     */
    @ApiOperation({
        summary: 'Send message (SSE streaming response)',
        description: 'Accepts JWT or API key Bearer token.',
    })
    @ApiSecurity('api-key')
    @RequireApiKeyScope(API_KEY_SCOPES.CHAT_MESSAGE)
    @UseGuards(ApiKeyGuard)
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
                dto.mcpServers,
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
