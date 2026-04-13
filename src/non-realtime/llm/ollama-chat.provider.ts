import { Logger } from '@nestjs/common';
import {
    ILlmProvider,
    LlmDelta,
    LlmMessage,
    LlmTool,
    LlmToolCall,
    LlmOptions,
} from '../interfaces/llm-provider.interface';
import OpenAI from 'openai';

/**
 * Ollama LLM Provider (Qwen3, Llama, DeepSeek, etc.)
 *
 * Uses Ollama's OpenAI-compatible API (/v1/chat/completions)
 * with streaming and tool calling support.
 *
 * Requires Ollama container running with a model pulled:
 *   docker exec ollama ollama pull gemma4:e4b
 */
export class OllamaChatProvider implements ILlmProvider {
    readonly name = 'ollama';
    private readonly logger = new Logger(OllamaChatProvider.name);
    private readonly client: OpenAI;

    constructor(baseUrl?: string) {
        // Ollama exposes OpenAI-compatible API at /v1
        const rawUrl = baseUrl || process.env.OLLAMA_URL || 'http://ollama:11434';
        const ollamaUrl = rawUrl.endsWith('/v1') ? rawUrl : `${rawUrl.replace(/\/+$/, '')}/v1`;
        this.client = new OpenAI({
            baseURL: ollamaUrl,
            apiKey: 'ollama', // Ollama doesn't need a key, but OpenAI SDK requires one
        });
    }

    async *chatStream(
        messages: LlmMessage[],
        tools: LlmTool[],
        options: LlmOptions,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta> {
        const openAiMessages = messages.map(m => this.toOpenAiMessage(m));

        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: options.model || process.env.DEFAULT_OLLAMA_MODEL || 'gemma4:e4b',
            messages: openAiMessages,
            stream: true,
            temperature: options.temperature ?? 0.8,
        };

        if (options.maxTokens) {
            params.max_tokens = options.maxTokens;
        }

        if (tools.length > 0) {
            params.tools = tools.map(t => ({
                type: 'function' as const,
                function: t.function,
            }));
            params.tool_choice = (options.toolChoice || 'auto') as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
        }

        try {
            const stream = await this.client.chat.completions.create(params, {
                signal: signal as any,
            });

            const toolCallAccumulator = new Map<number, {
                id: string;
                name: string;
                arguments: string;
            }>();

            for await (const chunk of stream) {
                if (signal?.aborted) return;

                const choice = chunk.choices?.[0];
                if (!choice) {
                    if (chunk.usage) {
                        yield {
                            done: true,
                            usage: {
                                promptTokens: chunk.usage.prompt_tokens,
                                completionTokens: chunk.usage.completion_tokens,
                                totalTokens: chunk.usage.total_tokens,
                            },
                        };
                    }
                    continue;
                }

                const delta = choice.delta;

                // Text content — filter out <think>...</think> blocks from Qwen3
                if (delta?.content) {
                    yield { text: delta.content, done: false };
                }

                // Tool calls
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        if (!toolCallAccumulator.has(idx)) {
                            toolCallAccumulator.set(idx, {
                                id: tc.id || `call_${Date.now()}_${idx}`,
                                name: tc.function?.name || '',
                                arguments: '',
                            });
                        }
                        const acc = toolCallAccumulator.get(idx)!;
                        if (tc.id) acc.id = tc.id;
                        if (tc.function?.name) acc.name = tc.function.name;
                        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
                    }
                }

                // Finished
                if (choice.finish_reason) {
                    const toolCalls: LlmToolCall[] = [];

                    if (choice.finish_reason === 'tool_calls' && toolCallAccumulator.size > 0) {
                        for (const [, tc] of toolCallAccumulator) {
                            toolCalls.push({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: tc.arguments,
                                },
                            });
                        }
                    }

                    yield {
                        done: true,
                        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                        usage: chunk.usage ? {
                            promptTokens: chunk.usage.prompt_tokens,
                            completionTokens: chunk.usage.completion_tokens,
                            totalTokens: chunk.usage.total_tokens,
                        } : undefined,
                    };
                }
            }
        } catch (err) {
            if (signal?.aborted) return;
            this.logger.error(`[Ollama] Stream error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Check if Ollama is reachable and has a model loaded.
     */
    async healthCheck(): Promise<{ status: string; models?: string[]; url?: string }> {
        try {
            const baseUrl = (this.client as any)?.baseURL || process.env.OLLAMA_URL || 'http://ollama:11434/v1';
            const ollamaBase = baseUrl.replace('/v1', '');
            const res = await fetch(`${ollamaBase}/api/tags`);
            const data = await res.json();
            const models = data.models?.map((m: any) => m.name) || [];
            return { status: 'ok', models };
        } catch {
            return { status: 'unavailable', url: process.env.OLLAMA_URL || 'http://ollama:11434' };
        }
    }

    private toOpenAiMessage(msg: LlmMessage): any {
        const result: any = { role: msg.role, content: msg.content ?? null };

        if (msg.tool_calls) {
            result.tool_calls = msg.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            }));
        }

        if (msg.tool_call_id) {
            result.tool_call_id = msg.tool_call_id;
        }

        if (msg.name) {
            result.name = msg.name;
        }

        return result;
    }
}
