import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtOrApiKeyGuard } from '../auth/jwt-or-api-key.guard';
import { ChatCompletionsRequest } from './dto/chat-completions.dto';
import { OpenAiCompatService } from './openai-compat.service';

@ApiTags('OpenAI Compatible')
@ApiSecurity('api-key')
@UseGuards(JwtOrApiKeyGuard)
@Controller('v1/chat')
export class OpenAiCompatController {
    constructor(private readonly compatService: OpenAiCompatService) {}

    @ApiOperation({
        summary: 'OpenAI-compatible chat completions',
        description:
            'Bearer aipbx_… (scope chat:message) or JWT. Unknown models (e.g. gpt-4o-mini) fall back to DEFAULT_OLLAMA_MODEL.',
    })
    @HttpCode(200)
    @Post('completions')
    async completions(
        @Body() dto: ChatCompletionsRequest,
        @Req() req: any,
        @Res() res: Response,
    ) {
        const abort = new AbortController();
        req.on('close', () => abort.abort());

        const result = await this.compatService.complete(dto, abort.signal);

        if (result.stream === false) {
            return res.json(result.body);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        try {
            for await (const chunk of this.compatService.sanitizeStream(result.iterator, result.model)) {
                if (abort.signal.aborted) break;
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            if (!abort.signal.aborted) {
                res.write('data: [DONE]\n\n');
            }
        } finally {
            res.end();
        }
    }
}
