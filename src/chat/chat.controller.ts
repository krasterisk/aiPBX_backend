import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('Helpdesk Chat')
@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    /**
     * SSE streaming chat endpoint.
     *
     * Client sends POST with message + optional history.
     * Server responds with SSE events:
     *   - event: text       → { data: "chunk of text" }
     *   - event: tool_call  → { data: { name, arguments } }
     *   - event: tool_result → { data: { name, result } }
     *   - event: done       → { data: { totalLength } }
     *   - event: error      → { data: "error message" }
     *
     * Frontend usage:
     *   const response = await fetch('/api/chat', { method: 'POST', body: JSON.stringify({...}), headers: {...} });
     *   const reader = response.body.getReader();
     *   // read SSE events...
     */
    @ApiOperation({ summary: 'Stream chat response (SSE)' })
    @UseGuards(JwtAuthGuard)
    @Post()
    async chat(
        @Body() dto: ChatRequestDto,
        @Req() req: any,
        @Res() res: Response,
    ) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const abortController = new AbortController();

        // Cleanup on client disconnect
        req.on('close', () => {
            abortController.abort();
        });

        try {
            const stream = this.chatService.streamChat(
                dto.message,
                dto.history || [],
                dto.assistantId,
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
