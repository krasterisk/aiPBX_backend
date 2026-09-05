import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DEFAULT_COMPAT_MODEL, isOpenAiChatMessage, pickOllamaModel, stripThinkTags } from './openai-compat.util';
import { ChatCompletionsRequest } from './dto/chat-completions.dto';

export interface OpenAiCompletionBody {
    id: string;
    object: 'chat.completion';
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string | null;
            tool_calls?: unknown[];
        };
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

export type CompletionsResult =
    | { stream: false; body: OpenAiCompletionBody }
    | { stream: true; model: string; iterator: AsyncIterable<unknown> };

@Injectable()
export class OpenAiCompatService {
    constructor(
        private readonly client: { chat: { completions: { create: (...args: any[]) => Promise<any> } } },
        private readonly listModels: () => Promise<string[]>,
        private readonly defaultModel: string = process.env.DEFAULT_OLLAMA_MODEL || DEFAULT_COMPAT_MODEL,
    ) {}

    async complete(dto: ChatCompletionsRequest, signal?: AbortSignal): Promise<CompletionsResult> {
        const messages = Array.isArray(dto.messages) ? dto.messages.filter(isOpenAiChatMessage) : [];
        if (messages.length === 0) {
            throw new HttpException('messages is required', HttpStatus.BAD_REQUEST);
        }

        const model = await this.resolveModel(dto.model);
        const params: Record<string, unknown> = {
            model,
            messages,
            stream: !!dto.stream,
        };
        if (dto.temperature != null) params.temperature = dto.temperature;
        if (dto.max_tokens != null) params.max_tokens = dto.max_tokens;
        if (dto.tools?.length) {
            params.tools = dto.tools;
            params.tool_choice = dto.tool_choice ?? 'auto';
        }

        try {
            const response = await this.client.chat.completions.create(params, { signal });
            if (dto.stream) {
                return { stream: true, model, iterator: response };
            }
            return { stream: false, body: this.toCompletion(response, model) };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw new HttpException(
                err?.message || 'LLM request failed',
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    async resolveModel(requested?: string): Promise<string> {
        try {
            const available = await this.listModels();
            return pickOllamaModel(requested, available, this.defaultModel);
        } catch {
            return this.defaultModel;
        }
    }

    async *sanitizeStream(iterator: AsyncIterable<any>, model: string): AsyncGenerator<unknown> {
        let insideThink = false;
        for await (const chunk of iterator) {
            const choice = chunk?.choices?.[0];
            const delta = choice?.delta;
            if (delta?.content) {
                let text = String(delta.content);
                if (text.includes('<think>')) {
                    insideThink = true;
                    text = text.replace(/<think>[\s\S]*/g, '');
                }
                if (insideThink && text.includes('</think>')) {
                    insideThink = false;
                    text = text.replace(/[\s\S]*<\/think>/g, '');
                }
                if (insideThink) {
                    continue;
                }
                delta.content = text;
                if (!text && !delta.tool_calls && !choice?.finish_reason) {
                    continue;
                }
            }
            if (chunk && !chunk.model) {
                chunk.model = model;
            }
            yield chunk;
        }
    }

    private toCompletion(raw: any, model: string): OpenAiCompletionBody {
        const choice = raw?.choices?.[0];
        const message = choice?.message ?? {};
        const content = typeof message.content === 'string'
            ? stripThinkTags(message.content)
            : message.content ?? null;

        return {
            id: raw?.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: raw?.created || Math.floor(Date.now() / 1000),
            model: raw?.model || model,
            choices: [{
                index: 0,
                message: {
                    role: message.role || 'assistant',
                    content,
                    ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
                },
                finish_reason: choice?.finish_reason ?? 'stop',
            }],
            usage: raw?.usage,
        };
    }
}
