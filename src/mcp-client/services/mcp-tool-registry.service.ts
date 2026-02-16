import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { McpToolRegistry } from '../models/mcp-tool-registry.model';
import { McpServer } from '../models/mcp-server.model';
import { McpConnectionManagerService } from './mcp-connection-manager.service';
import { McpCryptoService } from './mcp-crypto.service';
import { TelegramService } from '../../telegram/telegram.service';
import { Bitrix24Service } from './bitrix24.service';

@Injectable()
export class McpToolRegistryService {
    private readonly logger = new Logger(McpToolRegistryService.name);

    constructor(
        @InjectModel(McpToolRegistry)
        private readonly toolRegistryModel: typeof McpToolRegistry,
        @InjectModel(McpServer)
        private readonly mcpServerModel: typeof McpServer,
        private readonly connectionManager: McpConnectionManagerService,
        private readonly cryptoService: McpCryptoService,
        private readonly telegramService: TelegramService,
        private readonly bitrix24Service: Bitrix24Service,
    ) { }

    /**
     * Sync tools from an MCP server — calls tools/list and upserts into DB.
     * For internal integrations (Telegram, Bitrix24), uses predefined tool lists.
     */
    async syncTools(serverId: number): Promise<McpToolRegistry[]> {
        const server = await this.mcpServerModel.unscoped().findByPk(serverId);
        if (!server) throw new Error(`MCP server ${serverId} not found`);

        // ─── Internal integrations: use predefined tools ─────────────
        if (server.composioToolkit === 'telegram') {
            const tools = this.telegramService.getAvailableTools();
            return this.saveComposioTools(serverId, server.userId, tools);
        }

        if (server.composioToolkit === 'bitrix24') {
            const tools = this.bitrix24Service.getAvailableTools();
            return this.saveComposioTools(serverId, server.userId, tools);
        }

        // ─── Remote MCP servers ──────────────────────────────────────

        let authType = server.authType;
        let authCredentials = this.cryptoService.decrypt(server.authCredentials);

        // Composio servers always need the API key
        if (server.composioToolkit) {
            authType = 'apikey';
            authCredentials = { apiKey: process.env.COMPOSIO_API_KEY };
        }

        const config = {
            serverId: server.id,
            url: server.url,
            transport: server.transport,
            authType,
            authCredentials,
        };

        const mcpTools = await this.connectionManager.listTools(config);

        const now = new Date();
        const syncedIds: number[] = [];

        for (const tool of mcpTools) {
            const [record] = await this.toolRegistryModel.upsert({
                mcpServerId: serverId,
                name: tool.name,
                description: tool.description || '',
                inputSchema: tool.inputSchema || null,
                lastSyncedAt: now,
                userId: server.userId,
            } as any);
            syncedIds.push(record.id);
        }

        // Remove tools that no longer exist on the server
        await this.toolRegistryModel.destroy({
            where: {
                mcpServerId: serverId,
                id: { [require('sequelize').Op.notIn]: syncedIds },
            },
        });

        this.logger.log(`Synced ${mcpTools.length} tools from server ${serverId}`);
        return this.getToolsByServer(serverId);
    }

    /**
     * Get all tools for a specific server.
     */
    async getToolsByServer(serverId: number): Promise<McpToolRegistry[]> {
        return this.toolRegistryModel.findAll({
            where: { mcpServerId: serverId },
            order: [['name', 'ASC']],
        });
    }

    /**
     * Get all enabled tools for a user.
     */
    async getEnabledToolsByUser(userId: number): Promise<McpToolRegistry[]> {
        return this.toolRegistryModel.findAll({
            where: { userId, isEnabled: true },
            include: [{ model: McpServer, where: { status: 'active' } }],
        });
    }

    /**
     * Convert MCP tools to OpenAI function format for session.update.
     */
    async getToolsForOpenAI(userId: number): Promise<any[]> {
        const tools = await this.getEnabledToolsByUser(userId);
        return tools.map((tool) => this.mcpToolToOpenAITool(tool));
    }

    /**
     * Convert a single MCP tool to OpenAI function format.
     * Uses `telegram_` prefix for Telegram, `bitrix24_` for Bitrix24,
     * `composio_` for other Composio tools, `mcp_` for generic MCP tools.
     */
    mcpToolToOpenAITool(tool: McpToolRegistry): any {
        const server = (tool as any).mcpServer;
        const toolkit = server?.composioToolkit;

        let name: string;
        if (toolkit === 'bitrix24') {
            name = `bitrix24_${tool.name}`;
        } else if (toolkit === 'telegram') {
            name = `telegram_${tool.name}`;
        } else if (toolkit) {
            name = `composio_${tool.name}`;
        } else {
            name = `mcp_${tool.mcpServerId}_${tool.name}`;
        }

        return {
            type: 'function',
            name,
            description: tool.description || tool.name,
            parameters: tool.inputSchema || { type: 'object', properties: {} },
        };
    }

    /**
     * Parse an OpenAI tool name back to MCP serverId + toolName.
     * OpenAI name format: mcp_{serverId}_{toolName}
     */
    parseMcpToolName(openAiName: string): { serverId: number; toolName: string } | null {
        const match = openAiName.match(/^mcp_(\d+)_(.+)$/);
        if (!match) return null;
        return { serverId: parseInt(match[1], 10), toolName: match[2] };
    }

    /**
     * Toggle tool enabled/disabled.
     */
    async toggleTool(toolId: number, userId: number): Promise<McpToolRegistry> {
        const tool = await this.toolRegistryModel.findOne({ where: { id: toolId, userId } });
        if (!tool) throw new Error(`Tool ${toolId} not found`);
        tool.isEnabled = !tool.isEnabled;
        await tool.save();
        return tool;
    }

    /**
     * Bulk enable or disable all tools for a server.
     */
    async bulkToggleTools(
        serverId: number,
        userId: number,
        enabled: boolean,
    ): Promise<{ updated: number }> {
        const [updated] = await this.toolRegistryModel.update(
            { isEnabled: enabled },
            { where: { mcpServerId: serverId, userId } },
        );
        this.logger.log(`Bulk toggled ${updated} tools for server ${serverId} → ${enabled}`);
        return { updated };
    }

    /**
     * Save Composio-discovered actions into the tool registry.
     * New tools are created with isEnabled=false (unchecked) by default.
     * Existing tools keep their current isEnabled state on re-sync.
     */
    async saveComposioTools(
        serverId: number,
        userId: number,
        actions: Array<{ slug: string; name: string; description: string; inputSchema: any }>,
    ): Promise<McpToolRegistry[]> {
        const now = new Date();
        const syncedIds: number[] = [];

        for (const action of actions) {
            // Check if the tool already exists — preserve its isEnabled state
            const existing = await this.toolRegistryModel.findOne({
                where: { mcpServerId: serverId, name: action.slug },
            });

            const [record] = await this.toolRegistryModel.upsert({
                mcpServerId: serverId,
                name: action.slug,
                description: action.description || action.name,
                inputSchema: action.inputSchema || null,
                lastSyncedAt: now,
                userId,
                // New tools default to disabled; existing ones keep their state
                isEnabled: existing ? existing.isEnabled : false,
            } as any);
            syncedIds.push(record.id);
        }

        // Remove tools that are no longer available
        if (syncedIds.length > 0) {
            await this.toolRegistryModel.destroy({
                where: {
                    mcpServerId: serverId,
                    id: { [require('sequelize').Op.notIn]: syncedIds },
                },
            });
        }

        this.logger.log(`Saved ${actions.length} tools for server ${serverId}`);
        return this.getToolsByServer(serverId);
    }

    /**
     * Find a tool by its MCP name and server ID.
     */
    async findByNameAndServer(name: string, mcpServerId: number): Promise<McpToolRegistry | null> {
        return this.toolRegistryModel.findOne({ where: { name, mcpServerId } });
    }
}
