import { Body, Controller, HttpCode, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtOrApiKeyGuard } from '../auth/jwt-or-api-key.guard';
import { ChatCompletionsRequest } from './dto/chat-completions.dto';
import { OpenAiCompatService } from './openai-compat.service';
import { chunkHasVisibleText } from './openai-compat.util';

@ApiTags('OpenAI Compatible')
@ApiSecurity('api-key')
@UseGuards(JwtOrApiKeyGuard)
@Controller('v1/chat')
export class OpenAiCompatController {
    private readonly logger = new Logger(OpenAiCompatController.name);

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
        this.logger.log(
            `completions stream=${!!dto.stream} model=${dto.model || '-'} messages=${dto.messages?.length ?? 0}`,
        );

        const abort = new AbortController();
        // Do not listen to req.close — Express fires it when the body is consumed and would abort Ollama.
        res.on('close', () => abort.abort());

        const result = await this.compatService.complete(dto);

        if (result.stream === false) {
            const text = result.body.choices?.[0]?.message?.content;
            this.logger.log(`completions json chars=${typeof text === 'string' ? text.length : 0}`);
            return res.json(result.body);
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        try {
            let visible = false;
            for await (const chunk of this.compatService.sanitizeStream(result.iterator, result.model)) {
                if (abort.signal.aborted) break;
                if (chunkHasVisibleText(chunk)) visible = true;
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }

            if (!visible && !abort.signal.aborted) {
                this.logger.warn('stream had no visible text — falling back to a non-stream completion');
                const once = await this.compatService.complete({ ...dto, stream: false });
                if (once.stream === false) {
                    const content = once.body.choices?.[0]?.message?.content;
                    if (content) {
                        res.write(`data: ${JSON.stringify({
                            id: once.body.id,
                            object: 'chat.completion.chunk',
                            created: once.body.created,
                            model: once.body.model,
                            choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }],
                        })}\n\n`);
                        visible = true;
                    }
                }
            }

            this.logger.log(`completions sse visible=${visible}`);
            if (!abort.signal.aborted) {
                res.write('data: [DONE]\n\n');
            }
        } finally {
            res.end();
        }
    }
}
