import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { HttpService } from '@nestjs/axios';
import OpenAI from 'openai';
import { Chat } from './chat.model';
import { ChatToolsModel } from './chat-tools.model';
import { AiTool } from '../ai-tools/ai-tool.model';
import { AiToolsHandlersService } from '../ai-tools-handlers/ai-tools-handlers.service';
import { EphemeralMcpServerDto } from './dto/chat.dto';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
}

/**
 * Ephemeral MCP connection config — built per-request from DTO.
 * Index (idx) is used to namespace tool names: mcp_e{idx}_{toolName}.
 */
interface EphemeralMcpConfig {
    idx: number;
    url: string;
    transport: 'http' | 'websocket';
    headers: Record<string, string>;
}

/**
 * Chat Service — text-based AI chat (Helpdesk + External APIs).
 *
 * Each Chat is a separate entity with its own:
 *   - System prompt (instruction)
 *   - LLM model
 *   - Temperature
 *   - Tools (webhook AiTools + ephemeral MCP servers per-request)
 *
 * Features:
 *   - SSE streaming responses via Ollama (OpenAI-compatible API)
 *   - Tool calling loop (knowledge base search, webhooks)
 *   - Ephemeral MCP servers per-request (multi-tenancy, no DB storage)
 *   - Qwen3 <think> block filtering
 *   - Chat CRUD (create, update, delete, list)
 */
@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);
    private readonly client: OpenAI;
    private readonly defaultModel = process.env.DEFAULT_OLLAMA_MODEL || 'gemma4:e4b';

    /** MCP JSON-RPC timeout in ms */
    private static readonly MCP_TIMEOUT_MS = 15_000;

    constructor(
        @InjectModel(Chat) private chatModel: typeof Chat,
        @InjectModel(ChatToolsModel) private chatToolsModel: typeof ChatToolsModel,
        private readonly toolsHandlerService: AiToolsHandlersService,
        private readonly httpService: HttpService,
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
     *
     * @param chatId         - Chat entity ID (loads model, prompt, AiTools from DB)
     * @param message        - Current user message
     * @param history        - Conversation history (may include injected system message from caller)
     * @param signal         - AbortSignal for request cancellation
     * @param mcpServers     - Ephemeral MCP servers for this request (multi-tenancy).
     *                         Each server's tools are fetched live and namespaced as mcp_e{idx}_{toolName}.
     */
    async *streamChat(
        chatId: number,
        message: string,
        history: ChatMessage[] = [],
        signal?: AbortSignal,
        mcpServers?: EphemeralMcpServerDto[],
    ): AsyncGenerator<{ type: string; data: any }> {
        const chat = await this.getById(chatId);

        const systemPrompt = chat.instruction || 'You are a helpful assistant. Answer in the same language as the user.';
        const model = chat.model || this.defaultModel;
        const temperature = parseFloat(chat.temperature || '0.7');

        // ── 1. Static tools from AiTool (webhook/kb tools) ──────────────────
        let tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];
        if (chat.tools?.length) {
            tools = this.buildToolDefinitions(chat.tools);
        }

        // ── 2. Ephemeral MCP tools (per-request, multi-tenant) ──────────────
        const ephemeralConfigs: EphemeralMcpConfig[] = [];
        if (mcpServers?.length) {
            const mcpTools = await this.loadEphemeralMcpTools(mcpServers, ephemeralConfigs, signal);
            tools = [...tools, ...mcpTools];
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
        ];

        yield* this.chatLoop(messages, tools, model, temperature, chat, ephemeralConfigs, signal);
    }

    // ── Ephemeral MCP — Tool Discovery ─────────────────────

    /**
     * Fetch tools from all ephemeral MCP servers and convert to OpenAI format.
     * Populates ephemeralConfigs array for later tool routing in chatLoop.
     */
    private async loadEphemeralMcpTools(
        mcpServers: EphemeralMcpServerDto[],
        ephemeralConfigs: EphemeralMcpConfig[],
        signal?: AbortSignal,
    ): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
        const allTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [];

        for (let idx = 0; idx < mcpServers.length; idx++) {
            if (signal?.aborted) break;

            const srv = mcpServers[idx];
            const config: EphemeralMcpConfig = {
                idx,
                url: srv.url,
                transport: srv.transport || 'http',
                headers: srv.headers || {},
            };
            ephemeralConfigs.push(config);

            try {
                const mcpTools = await this.mcpListTools(config);
                this.logger.log(
                    `[Ephemeral MCP ${idx}] ${srv.url} → ${mcpTools.length} tools`,
                );

                for (const tool of mcpTools) {
                    // Namespace: mcp_e{idx}_{toolName}
                    const openAiName = `mcp_e${idx}_${tool.name}`;
                    allTools.push({
                        type: 'function',
                        function: {
                            name: openAiName,
                            description: tool.description || tool.name,
                            parameters: tool.inputSchema || { type: 'object', properties: {} },
                        },
                    });
                }
            } catch (err) {
                // Non-fatal: if MCP server is unreachable, skip its tools but log clearly
                this.logger.error(
                    `[Ephemeral MCP ${idx}] Failed to fetch tools from ${srv.url}: ${err.message}`,
                );
            }
        }

        return allTools;
    }

    // ── Chat Loop ───────────────────────────────────────────

    /**
     * Chat loop — handles streaming + tool call iterations.
     * Routes tool calls to: AiTools (webhook) → Ephemeral MCP servers.
     */
    private async *chatLoop(
        messages: ChatMessage[],
        tools: OpenAI.Chat.Completions.ChatCompletionTool[],
        model: string,
        temperature: number,
        chat: Chat,
        ephemeralConfigs: EphemeralMcpConfig[],
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

                    // Tool calls accumulator
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
                        result = await this.dispatchToolCall(
                            tc.name,
                            tc.arguments,
                            chat,
                            ephemeralConfigs,
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

    // ── Tool Dispatch ───────────────────────────────────────

    /**
     * Route a tool call to the correct handler:
     *   1. Ephemeral MCP (mcp_e{idx}_{toolName}) → mcpCallTool() to the correct server
     *   2. Everything else → AiToolsHandlersService (webhook / KB tools)
     */
    private async dispatchToolCall(
        toolName: string,
        rawArguments: string,
        chat: Chat,
        ephemeralConfigs: EphemeralMcpConfig[],
    ): Promise<string> {
        // ── Route 1: Ephemeral MCP tool ─────────────────────────────────────
        const mcpMatch = toolName.match(/^mcp_e(\d+)_(.+)$/);
        if (mcpMatch) {
            const serverIdx = parseInt(mcpMatch[1], 10);
            const realToolName = mcpMatch[2];
            const config = ephemeralConfigs[serverIdx];

            if (!config) {
                throw new Error(`Ephemeral MCP server #${serverIdx} not found in this request context`);
            }

            this.logger.log(
                `[MCP e${serverIdx}] Calling ${realToolName} on ${config.url}`,
            );

            const args = this.parseArguments(rawArguments);
            const result = await this.mcpCallTool(config, realToolName, args);
            return typeof result === 'string' ? result : JSON.stringify(result);
        }

        // ── Route 2: Local webhook / KB tool ────────────────────────────────
        return this.toolsHandlerService.functionHandler(
            toolName,
            rawArguments,
            { userId: chat.userId } as any,
        );
    }

    // ── Ephemeral MCP — JSON-RPC calls ─────────────────────

    /**
     * Call tools/list on an ephemeral MCP server via HTTP JSON-RPC 2.0.
     */
    private async mcpListTools(config: EphemeralMcpConfig): Promise<any[]> {
        const result = await this.mcpHttpRpc(config, 'tools/list');
        return result?.tools || [];
    }

    /**
     * Call tools/call on an ephemeral MCP server via HTTP JSON-RPC 2.0.
     */
    private async mcpCallTool(config: EphemeralMcpConfig, name: string, args: any): Promise<any> {
        return this.mcpHttpRpc(config, 'tools/call', { name, arguments: args });
    }

    /**
     * Stateless HTTP JSON-RPC 2.0 call to an ephemeral MCP server.
     * Each call performs a fresh HTTP request — no persistent connections.
     */
    private async mcpHttpRpc(
        config: EphemeralMcpConfig,
        method: string,
        params?: any,
    ): Promise<any> {
        const id = uuidv4();

        const payload = {
            jsonrpc: '2.0',
            id,
            method,
            ...(params !== undefined && { params }),
        };

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
            // Merge caller-supplied headers (auth, tenant id, etc.)
            ...config.headers,
        };

        try {
            const response = await firstValueFrom(
                this.httpService.post(config.url, payload, {
                    headers,
                    responseType: 'text',
                    transformResponse: [(data) => data],
                    timeout: ChatService.MCP_TIMEOUT_MS,
                }),
            );

            const contentType = response.headers?.['content-type'] || '';
            const rawData = response.data as string;

            let body: any;

            if (contentType.includes('text/event-stream')) {
                body = this.parseSseJsonRpc(rawData, id);
            } else {
                body = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            }

            if (body?.error) {
                throw new Error(`MCP error: ${JSON.stringify(body.error)}`);
            }

            return body?.result;
        } catch (err) {
            // Re-throw JSON-RPC errors as-is
            if (err.message?.startsWith('MCP error:')) throw err;
            throw new Error(`Ephemeral MCP RPC to ${config.url} [${method}] failed: ${err.message}`);
        }
    }

    /**
     * Extract JSON-RPC result from SSE (Server-Sent Events) response.
     */
    private parseSseJsonRpc(raw: string, expectedId: string): any {
        for (const line of raw.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.jsonrpc === '2.0') return parsed;
            } catch { /* skip */ }
        }
        // Fallback: try whole response as JSON
        try {
            return JSON.parse(raw);
        } catch {
            this.logger.error(`Failed to parse MCP SSE: ${raw.substring(0, 300)}`);
            return { jsonrpc: '2.0', id: expectedId, result: null };
        }
    }

    // ── Helpers ─────────────────────────────────────────────

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

    private parseArguments(rawArgs: string): any {
        if (!rawArgs) return {};
        try {
            return typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        } catch {
            return {};
        }
    }
}
