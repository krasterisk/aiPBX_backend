import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Mapping of our template IDs to Composio toolkit slugs
// authType: 'oauth' = Composio managed OAuth, 'api_key' = user provides bot token/API key
export const COMPOSIO_TOOLKITS: Record<string, { slug: string; name: string; authType: 'oauth' | 'api_key' }> = {
    gmail: { slug: 'gmail', name: 'Gmail MCP', authType: 'oauth' },
    googlecalendar: { slug: 'googlecalendar', name: 'Google Calendar MCP', authType: 'oauth' },
    outlook: { slug: 'outlook', name: 'Outlook MCP', authType: 'oauth' },
    telegram: { slug: 'telegram', name: 'Telegram MCP', authType: 'api_key' },
    whatsapp: { slug: 'whatsapp', name: 'WhatsApp MCP', authType: 'api_key' },
    slack: { slug: 'slack', name: 'Slack MCP', authType: 'oauth' },
};

@Injectable()
export class ComposioService {
    private readonly logger = new Logger(ComposioService.name);
    private client: any;
    private apiKey: string;

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('COMPOSIO_API_KEY');
        if (this.apiKey) {
            process.env.COMPOSIO_API_KEY = this.apiKey;
            this.logger.log('Composio API key configured');
        } else {
            this.logger.warn('COMPOSIO_API_KEY not set — Composio integration disabled');
        }
    }

    /**
     * Lazy-init the @composio/client SDK.
     */
    private async getClient() {
        if (!this.apiKey) throw new Error('Composio not configured — COMPOSIO_API_KEY missing');
        if (!this.client) {
            const { Composio } = await import('@composio/client');
            this.client = new Composio({ apiKey: this.apiKey });
            this.logger.log('Composio SDK (@composio/client) initialized');
        }
        return this.client;
    }

    // ─── OAuth Flow ────────────────────────────────────────────────────

    /**
     * Step 1: Initiate OAuth connection for a toolkit.
     * Uses `link.create()` which returns a redirectUrl and a connected_account_id.
     */
    async initiateConnection(
        userId: number,
        templateId: string,
        callbackUrl: string,
    ): Promise<{ redirectUrl: string; connectedAccountId: string }> {
        const client = await this.getClient();

        const toolkit = COMPOSIO_TOOLKITS[templateId];
        if (!toolkit) throw new Error(`Unknown template: ${templateId}`);

        // API-key toolkits (Telegram, WhatsApp) don't support managed OAuth
        if (toolkit.authType === 'api_key') {
            throw new HttpException(
                `"${toolkit.name}" requires an API key / bot token. ` +
                `Use POST /mcp/composio/connect-apikey with { toolkit, apiKey } instead.`,
                HttpStatus.BAD_REQUEST,
            );
        }

        // Find or use the default Composio-managed auth config for this toolkit
        const authConfigs = await client.authConfigs.list({
            toolkit_slug: toolkit.slug,
            is_composio_managed: true,
        });



        let authConfigId: string;
        if (authConfigs.items?.length > 0) {
            authConfigId = authConfigs.items[0].id;
        } else {
            const created = await client.authConfigs.create({
                toolkit: { slug: toolkit.slug },
                auth_config: { type: 'use_composio_managed_auth' },
            });
            authConfigId = created.auth_config.id;
        }



        // Create a link session which returns the redirect URL
        const linkResult = await client.link.create({
            auth_config_id: authConfigId,
            user_id: String(userId),
            callback_url: callbackUrl,
        });

        this.logger.log(
            `Composio OAuth initiated for user ${userId}, toolkit ${toolkit.slug}, account ${linkResult.connected_account_id}`,
        );

        return {
            redirectUrl: linkResult.redirect_url,
            connectedAccountId: linkResult.connected_account_id,
        };
    }

    /**
     * Connect an API-key based toolkit (e.g. Telegram bot token).
     */
    async connectWithApiKey(
        userId: number,
        templateId: string,
        apiKey: string,
    ): Promise<{ connectedAccountId: string }> {
        const client = await this.getClient();

        const toolkit = COMPOSIO_TOOLKITS[templateId];
        if (!toolkit) throw new Error(`Unknown template: ${templateId}`);

        // Find or create auth config for this toolkit
        let authConfigId: string;
        const authConfigs = await client.authConfigs.list({
            toolkit_slug: toolkit.slug,
        });

        if (authConfigs.items?.length > 0) {
            authConfigId = authConfigs.items[0].id;
        } else {
            const created = await client.authConfigs.create({
                toolkit: { slug: toolkit.slug },
                auth_config: { type: 'use_custom_auth' },
            });
            authConfigId = created.auth_config.id;
        }

        // Create connected account with the API key / bot token
        // Each toolkit has its own field name for the credential
        const credentialField = toolkit.slug === 'telegram' ? 'bot_token' : 'api_key';

        const result = await client.connectedAccounts.create({
            auth_config: { id: authConfigId },
            connection: {
                user_id: String(userId),
                data: {
                    [credentialField]: apiKey,
                },
            },
        } as any);

        this.logger.log(
            `Composio API key connection created for user ${userId}, toolkit ${toolkit.slug}`,
        );

        return { connectedAccountId: result.id };
    }

    // ─── Connections Management ────────────────────────────────────────

    /**
     * List all connected accounts for a user (filtered by optional toolkit).
     */
    async getConnections(userId: number, toolkitSlug?: string) {
        const client = await this.getClient();

        const params: any = {
            user_ids: [String(userId)],
            statuses: ['ACTIVE'],
        };
        if (toolkitSlug) {
            params.toolkit_slugs = [toolkitSlug];
        }

        const result = await client.connectedAccounts.list(params);

        return (result.items || []).map((item: any) => ({
            id: item.id,
            toolkit: item.toolkit_slug || item.toolkit?.slug,
            toolkitName: item.toolkit?.name || item.toolkit_slug,
            status: item.status,
            createdAt: item.created_at,
        }));
    }

    /**
     * Delete a connected account by its ID.
     */
    async deleteConnection(connectedAccountId: string) {
        const client = await this.getClient();
        await client.connectedAccounts.delete(connectedAccountId);
        this.logger.log(`Composio connection deleted: ${connectedAccountId}`);
    }

    /**
     * Get connection status for all known toolkits for a user.
     */
    async getConnectionStatus(userId: number) {
        const client = await this.getClient();

        const result = await client.connectedAccounts.list({
            user_ids: [String(userId)],
            statuses: ['ACTIVE'],
        });

        const connections = result.items || [];
        const connectedSlugs = new Set(
            connections.map((c: any) => c.toolkit_slug || c.toolkit?.slug),
        );

        return Object.entries(COMPOSIO_TOOLKITS).map(([key, tk]) => ({
            key,
            slug: tk.slug,
            name: tk.name,
            isConnected: connectedSlugs.has(tk.slug),
            connectedAccountId: connections.find(
                (c: any) => (c.toolkit_slug || c.toolkit?.slug) === tk.slug,
            )?.id || null,
        }));
    }

    // ─── Actions Discovery ─────────────────────────────────────────────

    /**
     * Discover available actions (tools) for a toolkit.
     */
    async discoverActions(toolkitSlug: string) {
        const client = await this.getClient();

        const result = await client.tools.list({
            toolkit_slug: toolkitSlug,
            limit: 100,
        });

        return (result.items || []).map((tool: any) => ({
            slug: tool.slug,
            name: tool.name,
            description: tool.description,
            inputSchema: tool.input_parameters || {},
            tags: tool.tags || [],
        }));
    }

    // ─── Action Execution ──────────────────────────────────────────────

    /**
     * Execute a Composio action directly via SDK.
     *
     * @param userId   The user who owns the connection
     * @param toolSlug The Composio tool slug (e.g. GMAIL_SEND_EMAIL)
     * @param args     Arguments for the tool
     * @returns Stringified result
     */
    async executeAction(
        userId: number,
        toolSlug: string,
        args: Record<string, any>,
    ): Promise<string> {
        const client = await this.getClient();

        // Find the user's active connected account for this tool's toolkit
        const connectedAccountId = await this.findConnectedAccountForTool(userId, toolSlug);

        this.logger.log(`Executing Composio action: ${toolSlug} for user ${userId}`);

        const result = await client.tools.execute(toolSlug, {
            connected_account_id: connectedAccountId,
            entity_id: String(userId),
            arguments: args,
        });

        if (result.error) {
            throw new Error(`Composio action failed: ${result.error}`);
        }

        return typeof result.data === 'string'
            ? result.data
            : JSON.stringify(result.data);
    }

    /**
     * Find the connected account ID for a user, matching the tool's toolkit.
     */
    private async findConnectedAccountForTool(
        userId: number,
        toolSlug: string,
    ): Promise<string> {
        const client = await this.getClient();

        // Get the tool info to determine its toolkit
        const toolInfo = await client.tools.retrieve(toolSlug);
        const toolkitSlug = toolInfo.toolkit?.slug;

        if (!toolkitSlug) {
            throw new Error(`Cannot determine toolkit for tool: ${toolSlug}`);
        }

        const connections = await client.connectedAccounts.list({
            user_ids: [String(userId)],
            toolkit_slugs: [toolkitSlug],
            statuses: ['ACTIVE'],
        });

        if (!connections.items?.length) {
            throw new Error(
                `No active Composio connection for toolkit "${toolkitSlug}". ` +
                `Please connect "${toolkitSlug}" first via OAuth.`,
            );
        }

        return connections.items[0].id;
    }

    // ─── Helpers ───────────────────────────────────────────────────────

    /**
     * Check if Composio is configured.
     */
    isConfigured(): boolean {
        return !!this.apiKey;
    }
}
