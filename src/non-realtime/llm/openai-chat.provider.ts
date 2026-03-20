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
 * OpenAI Chat Completions LLM Provider.
 *
 * Uses streaming Chat Completions API (gpt-4o-mini, gpt-4o, etc.)
 * with function/tool calling support.
 */
export class OpenAiChatProvider implements ILlmProvider {
    readonly name = 'openai';
    private readonly logger = new Logger(OpenAiChatProvider.name);
    private readonly client: OpenAI;

    constructor(apiKey?: string) {
        this.client = new OpenAI({
            apiKey: apiKey || process.env.OPENAI_API_KEY,
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
            model: options.model || 'gpt-4o-mini',
            messages: openAiMessages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: options.temperature ?? 0.8,
        };

        if (options.maxTokens) {
            params.max_tokens = options.maxTokens;
        }

        if (tools.length > 0) {
            params.tools = tools.map(t => ({
                type: 'function',
                function: t.function,
            }));
            params.tool_choice = (options.toolChoice || 'auto') as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
        }

        try {
            const stream = await this.client.chat.completions.create(params, {
                signal: signal as any,
            });

            // Accumulate tool calls across deltas
            const toolCallAccumulator = new Map<number, {
                id: string;
                name: string;
                arguments: string;
            }>();

            for await (const chunk of stream) {
                if (signal?.aborted) return;

                const choice = chunk.choices?.[0];
                if (!choice) {
                    // Final chunk with usage only
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

                // Text content
                if (delta?.content) {
                    yield { text: delta.content, done: false };
                }

                // Tool calls (accumulated across multiple deltas)
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        if (!toolCallAccumulator.has(idx)) {
                            toolCallAccumulator.set(idx, {
                                id: tc.id || '',
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

                // Stream finished
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
            this.logger.error(`[OpenAI Chat] Stream error: ${err.message}`);
            throw err;
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
