import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { McpServer } from '../models/mcp-server.model';
import { McpCallLog } from '../models/mcp-call-log.model';
import { McpConnectionManagerService } from './mcp-connection-manager.service';
import { McpToolRegistryService } from './mcp-tool-registry.service';
import { McpPolicyService } from './mcp-policy.service';
import { McpCryptoService } from './mcp-crypto.service';
import { ComposioService } from './composio.service';
import { GetMcpServersDto } from '../dto/get-mcp-servers.dto';
import sequelize from 'sequelize';

@Injectable()
export class McpClientService {
    private readonly logger = new Logger(McpClientService.name);

    constructor(
        @InjectModel(McpServer)
        private readonly mcpServerModel: typeof McpServer,
        @InjectModel(McpCallLog)
        private readonly callLogModel: typeof McpCallLog,
        private readonly connectionManager: McpConnectionManagerService,
        private readonly toolRegistry: McpToolRegistryService,
        private readonly policyService: McpPolicyService,
        private readonly cryptoService: McpCryptoService,
        private readonly composioService: ComposioService,
    ) { }

    /**
     * Build connection config for an MCP server.
     * For Composio servers, auto-inject the API key.
     */
    private buildConnectionConfig(server: McpServer) {
        let authType = server.authType;
        let authCredentials = this.cryptoService.decrypt(server.authCredentials);

        // Composio servers always need the API key
        if (server.composioToolkit) {
            authType = 'apikey';
            authCredentials = { apiKey: process.env.COMPOSIO_API_KEY };
        }

        return {
            serverId: server.id,
            url: server.url,
            transport: server.transport,
            authType,
            authCredentials,
        };
    }

    // ─── Server Management ─────────────────────────────────────────────

    async createServer(data: any, userId: number): Promise<McpServer> {
        const serverData = { ...data, userId };
        if (serverData.authCredentials) {
            serverData.authCredentials = this.cryptoService.encrypt(serverData.authCredentials);
        }
        return this.mcpServerModel.create(serverData);
    }

    async get(query: GetMcpServersDto, isAdmin: boolean, userId: string) {
        try {
            const page = Number(query.page) || 1;
            const limit = Number(query.limit) || 25;
            const offset = (page - 1) * limit;
            const search = query.search || '';

            const effectiveUserId = !isAdmin ? Number(userId) : Number(query.userId) || undefined;

            if (!userId && !isAdmin) {
                this.logger.error('No userId detected and user is not admin');
                throw new HttpException({ message: 'Request error' }, HttpStatus.BAD_REQUEST);
            }

            const whereClause: any = {
                [sequelize.Op.or]: [
                    { name: { [sequelize.Op.like]: `%${search}%` } },
                    { url: { [sequelize.Op.like]: `%${search}%` } },
                ],
            };

            if (effectiveUserId !== undefined) {
                whereClause.userId = effectiveUserId;
            }

            return await this.mcpServerModel.findAndCountAll({
                offset,
                limit,
                distinct: true,
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [{
                    all: true,
                    attributes: {
                        exclude: ['password', 'activationCode', 'resetPasswordLink', 'googleId', 'telegramId', 'activationExpires', 'isActivated', 'vpbx_user_id']
                    }
                }],
            });
        } catch (e) {
            throw new HttpException({ message: '[McpServers]: Request error' } + e, HttpStatus.BAD_REQUEST);
        }
    }

    async getAll(isAdmin: boolean, userId: string) {
        try {
            if (!userId && !isAdmin) {
                throw new HttpException({ message: '[McpServers]: userId must be set' }, HttpStatus.BAD_REQUEST);
            }

            const effectiveUserId = isAdmin ? undefined : Number(userId);
            const whereClause: any = effectiveUserId ? { userId: effectiveUserId } : {};

            return await this.mcpServerModel.findAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                include: [{
                    all: true,
                    attributes: {
                        exclude: ['password', 'activationCode', 'resetPasswordLink', 'googleId', 'telegramId', 'activationExpires', 'isActivated', 'vpbx_user_id']
                    }
                }],
            });
        } catch (e) {
            throw new HttpException({ message: '[McpServers]: Request error' } + e, HttpStatus.BAD_REQUEST);
        }
    }

    async getServerById(serverId: number, userId: number, isAdmin = false): Promise<McpServer> {
        const where: any = { id: serverId };
        if (!isAdmin) {
            where.userId = userId;
        }
        const server = await this.mcpServerModel.unscoped().findOne({ where });
        if (!server) {
            throw new HttpException(`MCP server ${serverId} not found`, HttpStatus.NOT_FOUND);
        }
        return server;
    }

    async updateServer(serverId: number, data: any, userId: number, isAdmin = false): Promise<McpServer> {
        const server = await this.getServerById(serverId, userId, isAdmin);
        const updateData = { ...data };
        if (updateData.authCredentials) {
            updateData.authCredentials = this.cryptoService.encrypt(updateData.authCredentials);
        }
        await server.update(updateData);
        return server;
    }

    async deleteServer(serverId: number, userId: number, isAdmin = false): Promise<void> {
        const server = await this.getServerById(serverId, userId, isAdmin);
        this.connectionManager.disconnect(serverId);

        // If this is a Composio server, also delete the Composio connection
        if (server.composioAccountId && this.composioService.isConfigured()) {
            try {
                await this.composioService.deleteConnection(server.composioAccountId);
                this.logger.log(
                    `Auto-deleted Composio connection ${server.composioAccountId} for server ${serverId}`,
                );
            } catch (err) {
                this.logger.warn(
                    `Failed to delete Composio connection ${server.composioAccountId}: ${err.message}`,
                );
            }
        }

        await server.destroy();
    }

    // ─── Connection Lifecycle ──────────────────────────────────────────

    async connectServer(serverId: number, userId: number, isAdmin = false): Promise<{ connected: boolean; toolsSynced: number }> {
        const server = await this.getServerById(serverId, userId, isAdmin);

        // Composio servers don't use real MCP transport — just mark active and sync
        if (server.composioToolkit) {
            await server.update({
                status: 'active',
                lastConnectedAt: new Date(),
                lastError: null,
            });

            let toolsSynced = 0;
            try {
                const actions = await this.composioService.discoverActions(server.composioToolkit);
                const tools = await this.toolRegistry.saveComposioTools(server.id, userId, actions);
                toolsSynced = tools.length;
            } catch (syncError) {
                this.logger.warn(`Composio sync failed for server ${serverId}: ${syncError.message}`);
            }

            return { connected: true, toolsSynced };
        }

        try {
            await this.connectionManager.connect(this.buildConnectionConfig(server));

            await server.update({
                status: 'active',
                lastConnectedAt: new Date(),
                lastError: null,
            });

            this.logger.log(`Connected to MCP server ${serverId}`);

            // Auto-sync tools after successful connection
            let toolsSynced = 0;
            try {
                const tools = await this.toolRegistry.syncTools(serverId);
                toolsSynced = Array.isArray(tools) ? tools.length : 0;
                this.logger.log(`Auto-synced ${toolsSynced} tools from MCP server ${serverId}`);
            } catch (syncError) {
                this.logger.warn(`Auto-sync failed for server ${serverId}: ${syncError.message}`);
            }

            return { connected: true, toolsSynced };
        } catch (error) {
            await server.update({
                status: 'error',
                lastError: error.message,
            });
            throw error;
        }
    }

    async disconnectServer(serverId: number, userId: number, isAdmin = false): Promise<void> {
        const server = await this.getServerById(serverId, userId, isAdmin);
        this.connectionManager.disconnect(serverId);
        await server.update({ status: 'inactive' });
    }

    // ─── Tool Sync & Retrieval ─────────────────────────────────────────

    async syncTools(serverId: number, userId: number) {
        await this.getServerById(serverId, userId); // validate ownership
        return this.toolRegistry.syncTools(serverId);
    }

    async getToolsForOpenAI(userId: number): Promise<any[]> {
        return this.toolRegistry.getToolsForOpenAI(userId);
    }

    // ─── Tool Execution (via MCP) ──────────────────────────────────────

    /**
     * Execute an MCP tool call.
     * Called by ToolGatewayService when routing to an MCP tool.
     */
    async executeTool(
        serverId: number,
        toolName: string,
        args: any,
        channelId: string,
        userId: number,
    ): Promise<string> {
        const server = await this.mcpServerModel.unscoped().findByPk(serverId);
        if (!server) throw new Error(`MCP server ${serverId} not found`);

        // Check policies
        const toolRecord = await this.toolRegistry.findByNameAndServer(toolName, serverId);
        if (toolRecord) {
            await this.policyService.validateToolCall(toolRecord.id, args, userId);
        }

        const startTime = Date.now();
        let status: 'success' | 'error' = 'success';
        let result: any;

        try {
            result = await this.connectionManager.callTool(
                this.buildConnectionConfig(server),
                toolName,
                args,
            );
        } catch (error) {
            status = 'error';
            result = { error: error.message };
            this.logger.error(`MCP tool call failed: ${toolName} on server ${serverId}`, error.message);
        }

        const duration = Date.now() - startTime;

        // Audit log
        await this.callLogModel.create({
            mcpServerId: serverId,
            toolName,
            arguments: args,
            result,
            duration,
            status,
            channelId,
            source: 'mcp',
            userId,
        } as any);

        return typeof result === 'string' ? result : JSON.stringify(result);
    }

    // ─── Audit Log ─────────────────────────────────────────────────────

    async getCallLogs(userId: number, limit = 50, offset = 0) {
        return this.callLogModel.findAndCountAll({
            where: { userId },
            order: [['createdAt', 'DESC']],
            limit,
            offset,
        });
    }
}
