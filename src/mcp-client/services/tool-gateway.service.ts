import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { McpCallLog } from '../models/mcp-call-log.model';
import { McpServer } from '../models/mcp-server.model';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpClientService } from './mcp-client.service';
import { AiToolsHandlersService } from '../../ai-tools-handlers/ai-tools-handlers.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Assistant } from '../../assistants/assistants.model';
import { ComposioService } from './composio.service';
import { Bitrix24Service } from './bitrix24.service';

/**
 * Minimal session interface — mirrors the fields used from OpenAI sessionData.
 * The actual sessionData type is imported by consumers.
 */
interface ToolGatewaySession {
    channelId?: string;
    openAiConn?: any;
    isPlayground?: boolean;
    assistant?: any;
    pbxServer?: any;
    toolCallHistory?: Array<{
        name: string;
        calledAt: number;
        result: 'success' | 'error';
    }>;
}

/**
 * ToolGatewayService — unified entry point for ALL tool calls.
 *
 * Replaces the if/else chain in dataDecode() with a single execute() method
 * that routes to: built-in tools → composio direct → MCP remote tools → local webhook tools.
 */
@Injectable()
export class ToolGatewayService {
    private readonly logger = new Logger(ToolGatewayService.name);

    constructor(
        @InjectModel(McpCallLog)
        private readonly callLogModel: typeof McpCallLog,
        @InjectModel(McpServer)
        private readonly mcpServerModel: typeof McpServer,
        private readonly mcpToolRegistry: McpToolRegistryService,
        private readonly mcpClient: McpClientService,
        private readonly aiToolsHandlers: AiToolsHandlersService,
        private readonly eventEmitter: EventEmitter2,
        private readonly composioService: ComposioService,
        private readonly bitrix24Service: Bitrix24Service,
    ) { }

    /**
     * Execute a tool call from OpenAI's function_call.
     *
     * @returns output string to send as function_call_output, plus whether to auto-create a response.
     */
    async execute(
        item: { name: string; call_id: string; arguments: string },
        session: ToolGatewaySession,
        assistant: Assistant,
    ): Promise<{
        output: string;
        sendResponse: boolean;
    }> {
        const startTime = Date.now();
        let output: string;
        let status: 'success' | 'error' = 'success';
        let source: string;

        try {
            // ─── 1. Built-in Tools ─────────────────────────────────────
            if (item.name === 'hangup_call') {
                source = 'builtin';
                output = await this.handleHangup(session, assistant);
                return { output, sendResponse: false };
            }

            if (item.name === 'transfer_call') {
                source = 'builtin';
                output = await this.handleTransfer(item, session, assistant);
                return { output, sendResponse: true };
            }

            // ─── 2. Composio Direct Tools ──────────────────────────────
            const composioParsed = this.parseComposioToolName(item.name);
            if (composioParsed) {
                source = 'composio';
                const args = this.parseArguments(item.arguments);

                // Auto-inject metadata from the MCP server (e.g. chatId for Telegram)
                await this.injectComposioMeta(composioParsed.toolSlug, args, assistant.userId);

                output = await this.composioService.executeAction(
                    assistant.userId,
                    composioParsed.toolSlug,
                    args,
                );

                this.trackToolCall(session, item.name, 'success');
                return { output, sendResponse: true };
            }
            // ─── 2b. Bitrix24 Direct Tools ─────────────────────────────
            const bitrix24Parsed = this.parseBitrix24ToolName(item.name);
            if (bitrix24Parsed) {
                source = 'bitrix24';
                const args = this.parseArguments(item.arguments);

                // Find the Bitrix24 server to get webhook URL
                const webhookUrl = await this.getBitrix24WebhookUrl(assistant.userId);
                output = await this.bitrix24Service.executeAction(
                    webhookUrl,
                    bitrix24Parsed.toolSlug,
                    args,
                );

                this.trackToolCall(session, item.name, 'success');
                return { output, sendResponse: true };
            }

            // ─── 3. MCP Remote Tools ──────────────────────────────────
            const mcpParsed = this.mcpToolRegistry.parseMcpToolName(item.name);
            if (mcpParsed) {
                source = 'mcp';
                const args = this.parseArguments(item.arguments);

                output = await this.mcpClient.executeTool(
                    mcpParsed.serverId,
                    mcpParsed.toolName,
                    args,
                    session.channelId,
                    assistant.userId,
                );

                this.trackToolCall(session, item.name, 'success');
                return { output, sendResponse: true };
            }

            // ─── 4. Local Webhook Tools ───────────────────────────────
            source = 'webhook';
            output = await this.aiToolsHandlers.functionHandler(
                item.name,
                item.arguments,
                assistant,
            );

            this.trackToolCall(session, item.name, 'success');
            return { output, sendResponse: true };

        } catch (error) {
            status = 'error';
            output = `Error: ${error.message}`;
            this.logger.error(`Tool ${item.name} failed:`, error.message);
            this.trackToolCall(session, item.name, 'error');
            return { output, sendResponse: true };
        } finally {
            const duration = Date.now() - startTime;
            // Async audit log — don't block the main flow
            this.logToolCall(item, output, duration, status, source, session, assistant).catch(
                (e) => this.logger.error('Failed to log tool call:', e.message),
            );
        }
    }

    // ─── Built-in Tool Handlers ────────────────────────────────────────

    private async handleHangup(
        session: ToolGatewaySession,
        assistant: Assistant,
    ): Promise<string> {
        if (session.isPlayground || session.channelId?.startsWith('playground-')) {
            this.logger.log('Hangup triggered in playground — closing session');
        }

        this.logger.log(`Hangup call triggered for ${session.channelId}`);
        this.eventEmitter.emit(`HangupCall.${session.channelId}`);
        return 'Call ended';
    }

    private async handleTransfer(
        item: { name: string; call_id: string; arguments: string },
        session: ToolGatewaySession,
        assistant: Assistant,
    ): Promise<string> {
        if (session.isPlayground || session.channelId?.startsWith('playground-')) {
            this.logger.log('Transfer not supported in playground mode');
            return 'Transfer is not available in playground mode. Please inform the user that call transfer to an agent is not supported in the test environment.';
        }

        const args = this.parseArguments(item.arguments);
        const exten = args?.exten;

        if (exten && exten.trim() !== '') {
            const params = {
                extension: exten,
                context: session.pbxServer?.context || 'default',
            };
            this.logger.log(`Transferring call ${session.channelId} to ${exten}`);
            this.eventEmitter.emit(`transferToDialplan.${session.channelId}`, params);
            return `Call transferred to ${exten}`;
        }

        return 'Transfer failed: no extension provided';
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    /**
     * Parse Composio tool names.
     * Convention: composio_GMAIL_SEND_EMAIL → toolSlug = GMAIL_SEND_EMAIL
     */
    private parseComposioToolName(name: string): { toolSlug: string } | null {
        if (!name.startsWith('composio_')) return null;
        const toolSlug = name.substring('composio_'.length);
        if (!toolSlug) return null;
        return { toolSlug };
    }

    /**
     * Parse Bitrix24 tool names.
     * Convention: bitrix24_BITRIX24_CRM_LEAD_ADD → toolSlug = BITRIX24_CRM_LEAD_ADD
     */
    private parseBitrix24ToolName(name: string): { toolSlug: string } | null {
        if (!name.startsWith('bitrix24_')) return null;
        const toolSlug = name.substring('bitrix24_'.length);
        if (!toolSlug) return null;
        return { toolSlug };
    }

    /**
     * Get the Bitrix24 webhook URL for a user from their MCP server record.
     */
    private async getBitrix24WebhookUrl(userId: number): Promise<string> {
        const server = await this.mcpServerModel.findOne({
            where: {
                userId,
                composioToolkit: 'bitrix24',
                status: 'active',
            },
        });

        if (!server?.url) {
            throw new Error('Bitrix24 is not connected. Please connect your Bitrix24 account first.');
        }

        return server.url;
    }

    /**
     * Auto-inject metadata from the MCP server's composioMeta into tool arguments.
     * E.g. for Telegram, injects chat_id from the stored chatId.
     */
    private async injectComposioMeta(
        toolSlug: string,
        args: Record<string, any>,
        userId: number,
    ): Promise<void> {
        // Extract toolkit prefix from tool slug (e.g. TELEGRAM_SEND_TEXT_MESSAGE → telegram)
        const toolkitSlug = toolSlug.split('_')[0]?.toLowerCase();
        if (!toolkitSlug) return;

        const server = await this.mcpServerModel.findOne({
            where: {
                userId,
                composioToolkit: toolkitSlug,
                status: 'active',
            },
        });

        if (!server?.composioMeta) return;

        // Telegram: inject chat_id if not already provided by AI
        if (toolkitSlug === 'telegram' && server.composioMeta.chatId && !args.chat_id) {
            args.chat_id = server.composioMeta.chatId;
            this.logger.log(`Auto-injected chat_id=${args.chat_id} for Telegram tool`);
        }
    }

    private parseArguments(rawArgs: string): any {
        if (!rawArgs) return {};
        try {
            return typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
        } catch {
            return {};
        }
    }

    private trackToolCall(
        session: ToolGatewaySession,
        name: string,
        result: 'success' | 'error',
    ): void {
        if (!session.toolCallHistory) {
            session.toolCallHistory = [];
        }
        session.toolCallHistory.push({
            name,
            calledAt: Date.now(),
            result,
        });
    }

    private async logToolCall(
        item: { name: string; arguments: string },
        output: string,
        duration: number,
        status: 'success' | 'error',
        source: string,
        session: ToolGatewaySession,
        assistant: Assistant,
    ): Promise<void> {
        await this.callLogModel.create({
            toolName: item.name,
            arguments: this.parseArguments(item.arguments),
            result: output,
            duration,
            status,
            channelId: session.channelId,
            source,
            userId: assistant.userId,
        } as any);
    }
}
