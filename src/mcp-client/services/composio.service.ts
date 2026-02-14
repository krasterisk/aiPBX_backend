import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Mapping of our template IDs to Composio toolkit slugs
export const COMPOSIO_TOOLKITS = {
    gmail: { slug: 'gmail', name: 'Gmail MCP' },
    googlecalendar: { slug: 'googlecalendar', name: 'Google Calendar MCP' },
    outlook: { slug: 'outlook', name: 'Outlook Mail MCP' },
    outlookcalendar: { slug: 'outlookcalendar', name: 'Outlook Calendar MCP' },
    telegram: { slug: 'telegram', name: 'Telegram MCP' },
    whatsapp: { slug: 'whatsapp', name: 'WhatsApp MCP' },
    slack: { slug: 'slack', name: 'Slack MCP' },
};

@Injectable()
export class ComposioService {
    private readonly logger = new Logger(ComposioService.name);
    private composio: any;
    private apiKey: string;

    constructor(private configService: ConfigService) {
        this.apiKey = this.configService.get<string>('COMPOSIO_API_KEY');
        if (this.apiKey) {
            // Set env var so @composio/client picks it up automatically
            process.env.COMPOSIO_API_KEY = this.apiKey;
            this.logger.log('Composio API key configured');
        } else {
            this.logger.warn('COMPOSIO_API_KEY not set — Composio integration disabled');
        }
    }

    private async getClient() {
        if (!this.apiKey) throw new Error('Composio not configured — COMPOSIO_API_KEY missing');
        if (!this.composio) {
            const { Composio } = await import('@composio/core');
            this.composio = new Composio({ apiKey: this.apiKey });
            this.logger.log('Composio SDK initialized');
        }
        return this.composio;
    }

    /**
     * Step 1: Initiate OAuth connection for a toolkit
     * Returns a redirectUrl that the frontend opens in a popup
     */
    async initiateConnection(
        userId: number,
        templateId: string,
        callbackUrl: string,
    ): Promise<{ redirectUrl: string }> {
        const composio = await this.getClient();

        const toolkit = COMPOSIO_TOOLKITS[templateId];
        if (!toolkit) throw new Error(`Unknown template: ${templateId}`);

        const session = await composio.create(String(userId), {
            manageConnections: false,
        });

        const connectionRequest = await session.authorize(toolkit.slug, {
            callbackUrl,
        });

        this.logger.log(
            `Composio OAuth initiated for user ${userId}, toolkit ${toolkit.slug}`,
        );

        return { redirectUrl: connectionRequest.redirectUrl };
    }

    /**
     * Step 2: After OAuth callback, get the MCP server URL
     */
    async getMcpUrl(userId: number): Promise<string> {
        const composio = await this.getClient();

        const session = await composio.create(String(userId), {
            manageConnections: false,
        });

        return session.mcp.url;
    }

    /**
     * Step 3: Get connection status for all toolkits
     */
    async getConnectionStatus(userId: number) {
        const composio = await this.getClient();

        const session = await composio.create(String(userId), {
            manageConnections: false,
        });

        const toolkits = await session.toolkits();
        return toolkits.items.map((t) => ({
            name: t.name,
            slug: t.slug,
            isConnected: !!t.connection?.connectedAccount,
            connectedAccountId: t.connection?.connectedAccount?.id,
        }));
    }
}
