import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import OpenAI from 'openai';
import { Chat } from './chat.model';
import { ChatToolsModel } from './chat-tools.model';
import { AiTool } from '../ai-tools/ai-tool.model';
import { AiToolsHandlersService } from '../ai-tools-handlers/ai-tools-handlers.service';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

/**
 * Chat Service — text-based AI chat (Helpdesk).
 *
 * Each Chat is a separate entity with its own:
 *   - System prompt (instruction)
 *   - LLM model
 *   - Temperature
 *   - Tools (including KB search tools)
 *
 * Features:
 *   - SSE streaming responses via Ollama (OpenAI-compatible API)
 *   - Tool calling loop (knowledge base search, webhooks)
 *   - Qwen3 <think> block filtering
 *   - Chat CRUD (create, update, delete, list)
 */
@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly client: OpenAI;
    private readonly defaultModel = process.env.DEFAULT_OLLAMA_MODEL || 'gemma4:e4b';

    constructor(
        @InjectModel(Chat) private chatModel: typeof Chat,
        @InjectModel(ChatToolsModel) private chatToolsModel: typeof ChatToolsModel,
        private readonly toolsHandlerService: AiToolsHandlersService,
    ) {
        const ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
        this.client = new OpenAI({
            baseURL: `${ollamaUrl}/v1`,
            apiKey: 'ollama',
        });
    }

    // ── Chat CRUD ───────────────────────────────────────────

    async create(userId: number, data: {
        name: string;
        instruction?: string;
        model?: string;
        temperature?: string;
        toolIds?: number[];
    }): Promise<Chat> {
        const chat = await this.chatModel.create({
            userId,
            name: data.name,
            instruction: data.instruction,
            model: data.model || this.defaultModel,
            temperature: data.temperature || '0.7',
        } as any);

        if (data.toolIds?.length) {
            await this.setTools(chat.id, data.toolIds);
        }

        return this.getById(chat.id);
    }

    async getAll(userId: number): Promise<Chat[]> {
        return this.chatModel.findAll({
            where: { userId },
            include: [{ model: AiTool }],
            order: [['createdAt', 'DESC']],
        });
    }

    async getById(id: number): Promise<Chat> {
        const chat = await this.chatModel.findByPk(id, {
            include: [{ model: AiTool }],
        });
        if (!chat) throw new NotFoundException('Chat not found');
        return chat;
    }

    async update(id: number, userId: number, data: {
        name?: string;
        instruction?: string;
        model?: string;
        temperature?: string;
        toolIds?: number[];
    }): Promise<Chat> {
        const chat = await this.chatModel.findByPk(id);
        if (!chat || chat.userId !== userId) throw new NotFoundException('Chat not found');

        const { toolIds, ...updateData } = data;
        await chat.update(updateData);

        if (toolIds !== undefined) {
            await this.setTools(id, toolIds);
        }

        return this.getById(id);
    }

    async delete(id: number, userId: number): Promise<void> {
        const chat = await this.chatModel.findByPk(id);
        if (!chat || chat.userId !== userId) throw new NotFoundException('Chat not found');
        await chat.destroy();
    }

    private async setTools(chatId: number, toolIds: number[]): Promise<void> {
        await this.chatToolsModel.destroy({ where: { chatId } });
        if (toolIds.length > 0) {
            const records = toolIds.map(toolId => ({ chatId, toolId }));
            await this.chatToolsModel.bulkCreate(records as any);
        }
    }

    // ── Streaming Chat ──────────────────────────────────────

    /**
     * Stream a chat completion response.
     * Loads Chat entity config → builds tools → calls Ollama → streams SSE.
     */
    async *streamChat(
        chatId: number,
        message: string,
        history: ChatMessage[] = [],
        signal?: AbortSignal,
    ): AsyncGenerator<{ type: string; data: any }> {
        const chat = await this.getById(chatId);

        const systemPrompt = chat.instruction || 'You are a helpful assistant. Answer in the same language as the user.';
        const model = chat.model || this.defaultModel;
        const temperature = parseFloat(chat.temperature || '0.7');

        // Build tool definitions from chat's attached tools
        let tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
        if (chat.tools?.length) {
            tools = this.buildToolDefinitions(chat.tools);
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
        ];

        yield* this.chatLoop(messages, tools, model, temperature, chat, signal);
    }

    /**
     * Chat loop — handles streaming + tool call iterations.
     */
    private async *chatLoop(
        messages: ChatMessage[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        model: string,
        temperature: number,
        chat: Chat,
        signal?: AbortSignal,
        maxIterations = 5,
    ): AsyncGenerator<{ type: string; data: any }> {
        for (let iteration = 0; iteration < maxIterations; iteration++) {
            if (signal?.aborted) return;

            const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
                model,
                messages: messages as any,
                stream: true,
                temperature,
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

                    // Text — filter <think>...</think>
                    if (delta?.content) {
                        let text = delta.content;

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

            // Process tool calls
            if ((finishReason === 'tool_calls' || finishReason === 'stop') && toolCallAccumulator.size > 0) {
                const toolCalls = Array.from(toolCallAccumulator.values());

                messages.push({
                    role: 'assistant',
                    content: fullText || null,
                    tool_calls: toolCalls.map(tc => ({
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.name, arguments: tc.arguments },
                    })),
                });

                for (const tc of toolCalls) {
                    this.logger.log(`[Chat ${chat.id}] Tool call: ${tc.name}(${tc.arguments})`);
                    yield { type: 'tool_call', data: { name: tc.name, arguments: tc.arguments } };

                    let result: string;
                    try {
                        // Create a minimal assistant-like object for the handler
                        result = await this.toolsHandlerService.functionHandler(
                            tc.name, tc.arguments,
                            { userId: chat.userId } as any,
                        );
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

                continue;
            }

            yield { type: 'done', data: { totalLength: fullText.length } };
            return;
        }

        yield { type: 'error', data: 'Max tool call iterations reached' };
    }

    private buildToolDefinitions(tools: AiTool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
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
