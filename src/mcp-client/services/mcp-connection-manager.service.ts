import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { firstValueFrom } from 'rxjs';

/** JSON-RPC 2.0 request */
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: string;
    method: string;
    params?: any;
}

/** JSON-RPC 2.0 response */
interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: string;
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/** MCP connection configuration */
interface McpConnectionConfig {
    serverId: number;
    url: string;
    transport: 'websocket' | 'http';
    authType: 'none' | 'bearer' | 'apikey' | 'custom_headers';
    authCredentials?: any;
}

/** Active WebSocket connection wrapper */
interface WsConnection {
    ws: WebSocket;
    pending: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        timer: NodeJS.Timeout;
    }>;
    config: McpConnectionConfig;
    initialized: boolean;
    reconnectAttempts: number;
}

@Injectable()
export class McpConnectionManagerService implements OnModuleDestroy {
    private readonly logger = new Logger(McpConnectionManagerService.name);
    private readonly connections = new Map<number, WsConnection>();

    private static readonly RPC_TIMEOUT_MS = 30_000;
    private static readonly MAX_RECONNECT_ATTEMPTS = 5;
    private static readonly BASE_RECONNECT_DELAY_MS = 1_000;

    constructor(private readonly httpService: HttpService) { }

    /**
     * Connect to an MCP server (WebSocket or HTTP).
     * For HTTP, no persistent connection is maintained — this just validates reachability.
     */
    async connect(config: McpConnectionConfig): Promise<void> {
        if (config.transport === 'http') {
            // HTTP is stateless — just initialize
            await this.httpInitialize(config);
            return;
        }

        // WebSocket transport
        if (this.connections.has(config.serverId)) {
            const existing = this.connections.get(config.serverId);
            if (existing.ws.readyState === WebSocket.OPEN) {
                this.logger.log(`Already connected to MCP server ${config.serverId}`);
                return;
            }
            // Close stale connection
            this.closeWs(config.serverId);
        }

        await this.wsConnect(config);
    }

    /**
     * Disconnect from an MCP server.
     */
    disconnect(serverId: number): void {
        this.closeWs(serverId);
        this.logger.log(`Disconnected from MCP server ${serverId}`);
    }

    /**
     * Check if a connection is active.
     */
    isConnected(serverId: number): boolean {
        const conn = this.connections.get(serverId);
        return conn?.ws?.readyState === WebSocket.OPEN && conn.initialized;
    }

    /**
     * List available tools from the MCP server.
     */
    async listTools(config: McpConnectionConfig): Promise<any[]> {
        const result = await this.rpc(config, 'tools/list');
        return result?.tools || [];
    }

    /**
     * Call a tool on the MCP server.
     */
    async callTool(config: McpConnectionConfig, name: string, args: any): Promise<any> {
        return this.rpc(config, 'tools/call', { name, arguments: args });
    }

    /**
     * Generic JSON-RPC 2.0 call — routes to WS or HTTP.
     */
    private async rpc(config: McpConnectionConfig, method: string, params?: any): Promise<any> {
        if (config.transport === 'http') {
            return this.httpRpc(config, method, params);
        }
        return this.wsRpc(config.serverId, method, params);
    }

    // ─── WebSocket Transport ───────────────────────────────────────────

    private wsConnect(config: McpConnectionConfig): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const headers = this.buildAuthHeaders(config);

            const ws = new WebSocket(config.url, { headers });

            const conn: WsConnection = {
                ws,
                pending: new Map(),
                config,
                initialized: false,
                reconnectAttempts: 0,
            };

            ws.once('open', async () => {
                this.logger.log(`WebSocket connected to MCP server ${config.serverId}`);
                try {
                    await this.wsInitialize(conn);
                    conn.initialized = true;
                    conn.reconnectAttempts = 0;
                    this.connections.set(config.serverId, conn);
                    resolve();
                } catch (e) {
                    this.logger.error(`MCP initialize failed for server ${config.serverId}:`, e);
                    ws.close();
                    reject(e);
                }
            });

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString()) as JsonRpcResponse;
                    const pending = conn.pending.get(msg.id);
                    if (pending) {
                        clearTimeout(pending.timer);
                        conn.pending.delete(msg.id);
                        if (msg.error) {
                            pending.reject(msg.error);
                        } else {
                            pending.resolve(msg.result);
                        }
                    }
                } catch (e) {
                    this.logger.error(`Failed to parse MCP message from server ${config.serverId}:`, e);
                }
            });

            ws.on('error', (error) => {
                this.logger.error(`MCP WebSocket error for server ${config.serverId}:`, error.message);
                if (!conn.initialized) {
                    reject(error);
                }
            });

            ws.on('close', () => {
                this.logger.log(`MCP WebSocket closed for server ${config.serverId}`);
                // Reject all pending requests
                for (const [id, pending] of conn.pending) {
                    clearTimeout(pending.timer);
                    pending.reject(new Error('WebSocket connection closed'));
                }
                conn.pending.clear();
                conn.initialized = false;

                // Attempt reconnect with exponential backoff
                this.scheduleReconnect(conn);
            });

            // Timeout for initial connection
            setTimeout(() => {
                if (!conn.initialized) {
                    ws.close();
                    reject(new Error(`Connection timeout to MCP server ${config.serverId}`));
                }
            }, McpConnectionManagerService.RPC_TIMEOUT_MS);
        });
    }

    private async wsInitialize(conn: WsConnection): Promise<void> {
        const result = await this.wsRpcDirect(conn, 'initialize', {
            protocolVersion: '2025-03-26',
            clientInfo: {
                name: 'aiPBX',
                version: '1.0.0',
            },
            capabilities: {
                tools: {},
            },
        });
        this.logger.log(`MCP initialized for server ${conn.config.serverId}: ${JSON.stringify(result)}`);
    }

    private wsRpc(serverId: number, method: string, params?: any): Promise<any> {
        const conn = this.connections.get(serverId);
        if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
            throw new Error(`No active WebSocket connection for server ${serverId}`);
        }
        return this.wsRpcDirect(conn, method, params);
    }

    private wsRpcDirect(conn: WsConnection, method: string, params?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = uuidv4();

            const payload: JsonRpcRequest = {
                jsonrpc: '2.0',
                id,
                method,
                ...(params !== undefined && { params }),
            };

            const timer = setTimeout(() => {
                conn.pending.delete(id);
                reject(new Error(`RPC timeout for method ${method} (${McpConnectionManagerService.RPC_TIMEOUT_MS}ms)`));
            }, McpConnectionManagerService.RPC_TIMEOUT_MS);

            conn.pending.set(id, { resolve, reject, timer });
            conn.ws.send(JSON.stringify(payload));
        });
    }

    private scheduleReconnect(conn: WsConnection): void {
        if (conn.reconnectAttempts >= McpConnectionManagerService.MAX_RECONNECT_ATTEMPTS) {
            this.logger.warn(`Max reconnect attempts reached for server ${conn.config.serverId}`);
            this.connections.delete(conn.config.serverId);
            return;
        }

        const delay = McpConnectionManagerService.BASE_RECONNECT_DELAY_MS *
            Math.pow(2, conn.reconnectAttempts);
        conn.reconnectAttempts++;

        this.logger.log(`Scheduling reconnect for server ${conn.config.serverId} in ${delay}ms (attempt ${conn.reconnectAttempts})`);

        setTimeout(async () => {
            try {
                await this.wsConnect(conn.config);
                this.logger.log(`Reconnected to MCP server ${conn.config.serverId}`);
            } catch (e) {
                this.logger.error(`Reconnect failed for server ${conn.config.serverId}:`, e.message);
            }
        }, delay);
    }

    private closeWs(serverId: number): void {
        const conn = this.connections.get(serverId);
        if (conn) {
            for (const [id, pending] of conn.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Connection closed manually'));
            }
            conn.pending.clear();
            conn.reconnectAttempts = McpConnectionManagerService.MAX_RECONNECT_ATTEMPTS; // prevent auto-reconnect
            if (conn.ws) {
                conn.ws.removeAllListeners();
                conn.ws.close();
            }
            this.connections.delete(serverId);
        }
    }

    // ─── HTTP Transport (Streamable HTTP) ──────────────────────────────

    private async httpInitialize(config: McpConnectionConfig): Promise<void> {
        const result = await this.httpRpc(config, 'initialize', {
            protocolVersion: '2025-03-26',
            clientInfo: {
                name: 'aiPBX',
                version: '1.0.0',
            },
            capabilities: {
                tools: {},
            },
        });
        this.logger.log(`MCP HTTP initialized for server ${config.serverId}: ${JSON.stringify(result)}`);
    }

    private async httpRpc(config: McpConnectionConfig, method: string, params?: any): Promise<any> {
        const id = uuidv4();

        const payload: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            ...(params !== undefined && { params }),
        };

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
            ...this.buildAuthHeaders(config),
        };

        try {
            const response = await firstValueFrom(
                this.httpService.post(config.url, payload, {
                    headers,
                    responseType: 'text',
                    transformResponse: [(data) => data], // prevent auto-parse
                }),
            );

            const contentType = response.headers?.['content-type'] || '';
            const rawData = response.data as string;

            this.logger.debug(`MCP HTTP response for ${method} (content-type: ${contentType}): ${rawData.substring(0, 500)}`);

            let body: JsonRpcResponse;

            if (contentType.includes('text/event-stream')) {
                // Parse SSE: extract JSON from "data: {...}" lines
                body = this.parseSseResponse(rawData, id);
            } else {
                body = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            }

            if (body.error) {
                throw body.error;
            }
            return body.result;
        } catch (error) {
            if (error?.code !== undefined && error?.message !== undefined) {
                throw error; // already a JSON-RPC error
            }
            throw new Error(`HTTP RPC to ${config.url} failed: ${error.message}`);
        }
    }

    /**
     * Parse SSE (Server-Sent Events) response to extract JSON-RPC result.
     */
    private parseSseResponse(raw: string, expectedId: string): JsonRpcResponse {
        const lines = raw.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
                const jsonStr = trimmed.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (parsed.jsonrpc === '2.0') {
                        return parsed;
                    }
                } catch {
                    // not valid JSON, skip
                }
            }
        }
        // Fallback: try parsing entire response as JSON
        try {
            return JSON.parse(raw);
        } catch {
            this.logger.error(`Failed to parse MCP SSE response: ${raw.substring(0, 500)}`);
            return { jsonrpc: '2.0', id: expectedId, result: null };
        }
    }

    // ─── Auth Helpers ──────────────────────────────────────────────────

    private buildAuthHeaders(config: McpConnectionConfig): Record<string, string> {
        const creds = config.authCredentials || {};

        switch (config.authType) {
            case 'bearer':
                return { Authorization: `Bearer ${creds.token || ''}` };
            case 'apikey':
                return { 'X-API-Key': creds.apiKey || '' };
            case 'custom_headers':
                return typeof creds === 'object' ? creds : {};
            case 'none':
            default:
                return {};
        }
    }

    // ─── Lifecycle ─────────────────────────────────────────────────────

    onModuleDestroy() {
        for (const [serverId] of this.connections) {
            this.closeWs(serverId);
        }
        this.logger.log('All MCP connections closed');
    }
}
