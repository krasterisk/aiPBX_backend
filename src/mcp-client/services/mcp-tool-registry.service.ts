import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { McpToolRegistry } from '../models/mcp-tool-registry.model';
import { McpServer } from '../models/mcp-server.model';
import { McpConnectionManagerService } from './mcp-connection-manager.service';
import { McpCryptoService } from './mcp-crypto.service';

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
    ) { }

    /**
     * Sync tools from an MCP server — calls tools/list and upserts into DB.
     */
    async syncTools(serverId: number): Promise<McpToolRegistry[]> {
        const server = await this.mcpServerModel.findByPk(serverId);
        if (!server) throw new Error(`MCP server ${serverId} not found`);

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
     */
    mcpToolToOpenAITool(tool: McpToolRegistry): any {
        return {
            type: 'function',
            name: `mcp_${tool.mcpServerId}_${tool.name}`,
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
     * Find a tool by its MCP name and server ID.
     */
    async findByNameAndServer(name: string, mcpServerId: number): Promise<McpToolRegistry | null> {
        return this.toolRegistryModel.findOne({ where: { name, mcpServerId } });
    }
}
