import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { McpClientService } from './services/mcp-client.service';
import { McpToolRegistryService } from './services/mcp-tool-registry.service';
import { McpPolicyService } from './services/mcp-policy.service';
import { CreateMcpServerDto } from './dto/create-mcp-server.dto';
import { UpdateMcpServerDto } from './dto/update-mcp-server.dto';
import { CreateMcpPolicyDto } from './dto/create-mcp-policy.dto';
import { GetMcpServersDto } from './dto/get-mcp-servers.dto';
import { LoggerService } from '../logger/logger.service';
import { ComposioService, COMPOSIO_TOOLKITS } from './services/composio.service';

interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    vpbxUserId?: string;
}

@ApiTags('MCP Client')
@Controller('mcp')
export class McpClientController {
    constructor(
        private readonly mcpClient: McpClientService,
        private readonly toolRegistry: McpToolRegistryService,
        private readonly policyService: McpPolicyService,
        private readonly loggerService: LoggerService,
        private readonly composioService: ComposioService,
    ) { }

    private getUserId(req: RequestWithUser): number {
        return Number(req.vpbxUserId || req.tokenUserId);
    }

    // ─── Servers ───────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('servers')
    async createServer(@Body() dto: CreateMcpServerDto, @Req() req: RequestWithUser) {
        const result = await this.mcpClient.createServer(dto, this.getUserId(req));
        await this.loggerService.logAction(this.getUserId(req), 'create', 'mcpServer', null, `Created MCP server "${dto.name}"`, null, dto, req);
        return result;
    }

    @ApiOperation({ summary: 'List all MCP servers for the current user' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('servers')
    getAll(@Req() req: RequestWithUser) {
        const isAdmin = req.isAdmin ?? false;
        const userId = String(req.vpbxUserId || req.tokenUserId);
        return this.mcpClient.getAll(isAdmin, userId);
    }

    @ApiOperation({ summary: 'List MCP servers with pagination and search' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('servers/page')
    get(@Query() query: GetMcpServersDto, @Req() req: RequestWithUser) {
        const isAdmin = req.isAdmin ?? false;
        const userId = String(req.vpbxUserId || req.tokenUserId);
        return this.mcpClient.get(query, isAdmin, userId);
    }

    @ApiOperation({ summary: 'Update MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch('servers/:id')
    async updateServer(
        @Param('id') id: number,
        @Body() dto: UpdateMcpServerDto,
        @Req() req: RequestWithUser,
    ) {
        const result = await this.mcpClient.updateServer(id, dto, this.getUserId(req));
        await this.loggerService.logAction(this.getUserId(req), 'update', 'mcpServer', id, `Updated MCP server #${id}`, null, dto, req);
        return result;
    }

    @ApiOperation({ summary: 'Delete MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('servers/:id')
    async deleteServer(@Param('id') id: number, @Req() req: RequestWithUser) {
        const result = await this.mcpClient.deleteServer(id, this.getUserId(req));
        await this.loggerService.logAction(this.getUserId(req), 'delete', 'mcpServer', id, `Deleted MCP server #${id}`, null, null, req);
        return result;
    }

    // ─── Connection ───────────────────────────────────────────────────

    @ApiOperation({ summary: 'Connect to an MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('servers/:id/connect')
    connectServer(@Param('id') id: number, @Req() req: RequestWithUser) {
        return this.mcpClient.connectServer(id, this.getUserId(req));
    }

    @ApiOperation({ summary: 'Disconnect from an MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('servers/:id/disconnect')
    disconnectServer(@Param('id') id: number, @Req() req: RequestWithUser) {
        return this.mcpClient.disconnectServer(id, this.getUserId(req));
    }

    // ─── Tools ────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Sync tools from an MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('servers/:id/sync-tools')
    syncTools(@Param('id') id: number, @Req() req: RequestWithUser) {
        return this.mcpClient.syncTools(id, this.getUserId(req));
    }

    @ApiOperation({ summary: 'Get tools for a specific MCP server' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('servers/:id/tools')
    getServerTools(@Param('id') id: number) {
        return this.toolRegistry.getToolsByServer(id);
    }

    @ApiOperation({ summary: 'Toggle tool enabled/disabled' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch('tools/:id/toggle')
    toggleTool(@Param('id') id: number, @Req() req: RequestWithUser) {
        return this.toolRegistry.toggleTool(id, this.getUserId(req));
    }

    // ─── Policies ─────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Create policy for a tool' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('tools/:id/policies')
    createPolicy(
        @Param('id') toolId: number,
        @Body() dto: CreateMcpPolicyDto,
        @Req() req: RequestWithUser,
    ) {
        return this.policyService.createPolicy({
            ...dto,
            mcpToolRegistryId: toolId,
            userId: this.getUserId(req),
        });
    }

    @ApiOperation({ summary: 'Get policies for a tool' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('tools/:id/policies')
    getPolicies(@Param('id') toolId: number) {
        return this.policyService.getPoliciesByTool(toolId);
    }

    @ApiOperation({ summary: 'Delete a policy' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('policies/:id')
    deletePolicy(@Param('id') id: number, @Req() req: RequestWithUser) {
        return this.policyService.deletePolicy(id, this.getUserId(req));
    }

    // ─── Logs ─────────────────────────────────────────────────────────

    @ApiOperation({ summary: 'Get tool call audit logs' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('logs')
    getLogs(
        @Req() req: RequestWithUser,
        @Query('limit') limit?: number,
        @Query('offset') offset?: number,
    ) {
        return this.mcpClient.getCallLogs(
            this.getUserId(req),
            Number(limit) || 50,
            Number(offset) || 0,
        );
    }

    // ─── Composio Integration ──────────────────────────────────────

    @ApiOperation({ summary: 'Initiate Composio OAuth connection' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('composio/connect')
    async composioConnect(
        @Body() body: { toolkit: string },
        @Req() req: RequestWithUser,
    ) {
        const userId = this.getUserId(req);
        const backendUrl = process.env.API_URL || 'https://aipbx.com';
        const callbackUrl = `${backendUrl}/api/mcp/composio/callback?userId=${userId}&toolkit=${body.toolkit}`;
        return this.composioService.initiateConnection(userId, body.toolkit, callbackUrl);
    }

    @ApiOperation({ summary: 'Composio OAuth callback' })
    @Get('composio/callback')
    async composioCallback(
        @Query('userId') userId: string,
        @Query('toolkit') toolkit: string,
        @Query('status') status: string,
        @Query('connected_account_id') connectedAccountId: string,
        @Res() res: Response,
    ) {
        const clientUrl = process.env.CLIENT_URL || 'https://aipbx.com';

        if (status === 'success') {
            try {
                const mcpUrl = await this.composioService.getMcpUrl(Number(userId));
                const toolkitInfo = COMPOSIO_TOOLKITS[toolkit];
                const name = toolkitInfo?.name || `${toolkit} (Composio)`;

                // Auto-create MCP server
                const server = await this.mcpClient.createServer(
                    {
                        name,
                        url: mcpUrl,
                        transport: 'http' as const,
                        authType: 'apikey' as const,
                        authCredentials: { apiKey: process.env.COMPOSIO_API_KEY },
                        composioToolkit: toolkit,
                    },
                    Number(userId),
                );

                return res.redirect(`${clientUrl}/mcp-servers/${server.id}`);
            } catch (error) {
                return res.redirect(`${clientUrl}/mcp-servers?error=creation_failed`);
            }
        }

        return res.redirect(`${clientUrl}/mcp-servers?error=auth_failed`);
    }

    @ApiOperation({ summary: 'Get Composio connection status' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('composio/status')
    composioStatus(@Req() req: RequestWithUser) {
        return this.composioService.getConnectionStatus(this.getUserId(req));
    }
}
