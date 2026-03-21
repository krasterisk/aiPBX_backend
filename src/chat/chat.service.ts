import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { AiToolsHandlersService } from '../ai-tools-handlers/ai-tools-handlers.service';
import { AiToolsService } from '../ai-tools/ai-tools.service';
import { AssistantsService } from '../assistants/assistants.service';
import { Assistant } from '../assistants/assistants.model';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

/**
 * Chat Service — text-based AI chat via Ollama (OpenAI-compatible API).
 *
 * Features:
 *   - SSE streaming responses
 *   - Tool calling (including knowledge base search)
 *   - Conversation history management
 *   - Configurable per-assistant (model, instruction, tools)
 *   - Filters <think>...</think> reasoning blocks from Qwen3
 */
@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly client: OpenAI;
    private readonly defaultModel: string;

    constructor(
        private readonly toolsHandlerService: AiToolsHandlersService,
        private readonly toolsService: AiToolsService,
        private readonly assistantsService: AssistantsService,
    ) {
        const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
        this.client = new OpenAI({
            baseURL: `${ollamaUrl}/v1`,
            apiKey: 'ollama',
        });
        this.defaultModel = process.env.CHAT_MODEL || 'qwen3:8b';
    }

    /**
     * Stream a chat completion response.
     * Yields text chunks as SSE events. Handles tool calls internally.
     *
     * @param message - User's message text
     * @param history - Previous conversation messages
     * @param assistantId - Optional assistant ID for config (instruction, tools, model)
     * @param signal - AbortSignal for cancellation
     */
    async *streamChat(
        message: string,
        history: ChatMessage[] = [],
        assistantId?: number,
        signal?: AbortSignal,
    ): AsyncGenerator<{ type: string; data: any }> {
        // Load assistant config if provided
        let assistant: Assistant | null = null;
        let systemPrompt = '/no_think You are a helpful assistant for the aiPBX helpdesk. Answer in the same language as the user.';
        let model = this.defaultModel;
        let tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

        if (assistantId) {
            assistant = await this.assistantsService.getById(assistantId);
            if (assistant) {
                systemPrompt = '/no_think ' + (assistant.instruction || systemPrompt);
                model = assistant['llmModel'] || assistant.model || this.defaultModel;

                // Load assistant's tools
                const assistantTools = await this.toolsService.getAll(String(assistant.userId), false);
                if (assistantTools?.length) {
                    tools = this.buildToolDefinitions(assistantTools);
                }
            }
        }

        // Build messages array
        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
        ];

        // Run chat loop (may iterate for tool calls)
        yield* this.chatLoop(messages, tools, model, assistant, signal);
    }

    /**
     * Chat loop — handles streaming + tool call iterations.
     * After a tool call, adds tool result to messages and re-calls LLM.
     */
    private async *chatLoop(
        messages: ChatMessage[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        model: string,
        assistant: Assistant | null,
        signal?: AbortSignal,
        maxIterations = 5,
    ): AsyncGenerator<{ type: string; data: any }> {
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (signal?.aborted) return;

            const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
                model,
                messages: messages as any,
                stream: true,
                temperature: assistant ? parseFloat(assistant.temperature || '0.7') : 0.7,
            };

            if (tools.length > 0) {
                params.tools = tools;
                params.tool_choice = 'auto';
            }

            let fullText = '';
            const toolCallAccumulator = new Map<number, {
                id: string;
                name: string;
                arguments: string;
            }>();
            let finishReason: string | null = null;

            try {
                const stream = await this.client.chat.completions.create(params, {
                    signal: signal as any,
                });

                let insideThink = false;

                for await (const chunk of stream) {
                    if (signal?.aborted) return;

                    const choice = chunk.choices?.[0];
                    if (!choice) continue;

                    const delta = choice.delta;

                    // Text content — filter <think>...</think> blocks
                    if (delta?.content) {
                        let text = delta.content;

                        // Filter Qwen3 reasoning blocks
                        if (text.includes('<think>')) {
                            insideThink = true;
                            text = text.replace(/<think>[\s\S]*/g, '');
                        }
                        if (insideThink && text.includes('</think>')) {
                            insideThink = false;
                            text = text.replace(/[\s\S]*<\/think>/g, '');
                        }
                        if (insideThink) continue;

                        if (text) {
                            fullText += text;
                            yield { type: 'text', data: text };
                        }
                    }

                    // Tool calls accumulation
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

                    if (choice.finish_reason) {
                        finishReason = choice.finish_reason;
                    }
                }
            } catch (err) {
                if (signal?.aborted) return;
                this.logger.error(`Chat stream error: ${err.message}`);
                yield { type: 'error', data: err.message };
                return;
            }

            // Process tool calls if any
            if ((finishReason === 'tool_calls' || finishReason === 'stop') && toolCallAccumulator.size > 0) {
                const toolCalls = Array.from(toolCallAccumulator.values());

                // Add assistant message with tool calls
                messages.push({
                    role: 'assistant',
                    content: fullText || null,
                    tool_calls: toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.name, arguments: tc.arguments },
                    })),
                });

                // Execute each tool call
                for (const tc of toolCalls) {
                    this.logger.log(`Tool call: ${tc.name}(${tc.arguments})`);
                    yield { type: 'tool_call', data: { name: tc.name, arguments: tc.arguments } };

                    let result: string;
                    try {
                        if (assistant) {
                            result = await this.toolsHandlerService.functionHandler(tc.name, tc.arguments, assistant);
                        } else {
                            result = 'Tool execution not available without assistant configuration';
                        }
                    } catch (err) {
                        result = `Tool error: ${err.message}`;
                    }

                    messages.push({
                        role: 'tool',
                        content: result,
                        tool_call_id: tc.id,
                        name: tc.name,
                    });

                    yield { type: 'tool_result', data: { name: tc.name, result: result.substring(0, 200) } };
                }

                // Continue loop — LLM will generate response based on tool results
                continue;
            }

            // No tool calls — we're done
            yield { type: 'done', data: { totalLength: fullText.length } };
            return;
        }

        yield { type: 'error', data: 'Max tool call iterations reached' };
    }

    /**
     * Build OpenAI-compatible tool definitions from AiTool models.
     */
    private buildToolDefinitions(tools: any[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
        return tools
            .filter(t => t.type === 'function')
            .map(t => ({
                type: 'function' as const,
                function: {
                    name: t.name,
                    description: t.description || '',
                    parameters: typeof t.parameters === 'string'
                        ? JSON.parse(t.parameters)
                        : (t.parameters || { type: 'object', properties: {} }),
                },
            }));
    }
}
