import { WebSocket } from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Assistant } from "../assistants/assistants.model";
import { Logger } from "@nestjs/common";
import {
    RealtimeVendor,
    ResolvedRealtimeRouting,
    resolveRealtimeRouting,
} from './realtime-vendor.resolve';
import { isFatalRealtimeError } from './realtime-fatal-error';

export interface RealtimeConnectionOptions {
    /** Resolved routing (vendor + wire model). When omitted, inferred from assistant.model prefix. */
    routing?: ResolvedRealtimeRouting;
    /**
     * True when ai-models.wireModelId was explicitly set (non-empty).
     * When false, legacy YANDEX_MODEL env may override the wire id.
     */
    hasCatalogWireModelId?: boolean;
}

export class OpenAiConnection {
    private static readonly MAX_RECONNECT_ATTEMPTS = 5;
    private static readonly RECONNECT_BASE_MS = 500;
    private static readonly RECONNECT_MAX_MS = 10_000;

    private ws: WebSocket;
    private sendQueue: any[] = [];
    private isManualClose = false;
    /** Config/auth/model errors — do not reconnect. */
    private isFatal = false;
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly routing: ResolvedRealtimeRouting;
    private readonly hasCatalogWireModelId: boolean;

    private readonly logger = new Logger(OpenAiConnection.name);

    constructor(
        private readonly apiKey: string,
        private readonly channelId: string,
        private readonly eventEmitter: EventEmitter2,
        private readonly assistant: Assistant,
        options: RealtimeConnectionOptions = {},
    ) {
        this.routing = options.routing
            || resolveRealtimeRouting(assistant?.model);
        this.hasCatalogWireModelId = Boolean(options.hasCatalogWireModelId);
        this.connect();
    }

    get vendor(): RealtimeVendor {
        return this.routing.vendor;
    }

    get wireModelId(): string {
        return this.routing.wireModelId;
    }

    private resolveWireModelForVendor(vendor: RealtimeVendor, wireModelId: string): string {
        if (vendor !== 'yandex') return wireModelId;

        let model = wireModelId;
        if (!this.hasCatalogWireModelId) {
            model = process.env.YANDEX_MODEL?.trim() || wireModelId;
        }

        return this.normalizeYandexModelUri(model);
    }

    /**
     * Yandex expects `gpt://<folder_id>/<model>/…`.
     * Catalog may store either the full URI or a short id like `speech-realtime-…/latest`.
     */
    private normalizeYandexModelUri(model: string): string {
        const trimmed = (model || '').trim();
        if (!trimmed) return trimmed;
        if (/^(gpt|emb|speech):\/\//i.test(trimmed)) return trimmed;

        const folder = this.resolveYandexFolder();
        if (!folder) {
            this.logger.warn(
                `Yandex model "${trimmed}" is not a gpt:// URI and YANDEX_FOLDER is unset — API will likely reject it`,
            );
            return trimmed;
        }
        return `gpt://${folder}/${trimmed.replace(/^\/+/, '')}`;
    }

    /** Explicit folder env, or parse folder from legacy YANDEX_MODEL=gpt://folder/... */
    private resolveYandexFolder(): string | undefined {
        const direct = (
            process.env.YANDEX_FOLDER
            || process.env.YANDEX_FOLDER_ID
            || process.env.YC_FOLDER_ID
        )?.trim();
        if (direct) return direct;

        const legacyModel = process.env.YANDEX_MODEL?.trim();
        const match = legacyModel?.match(/^gpt:\/\/([^/]+)\//i);
        return match?.[1]?.trim() || undefined;
    }

    private connect() {
        if (this.isFatal || this.isManualClose) {
            return;
        }

        if (!this.assistant) {
            this.logger.error('Error initializing OpenAi Connection. Assistant is not configured');
            return
        }

        if (!this.assistant.model) {
            this.logger.error('Error initializing OpenAi Connection. Model name is empty');
            return
        }

        // Clean up old WebSocket before creating a new one (keep sendQueue for flush on open)
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
        }

        const { vendor } = this.routing;
        const wireModel = this.resolveWireModelForVendor(vendor, this.routing.wireModelId);
        let baseUrl = 'wss://api.openai.com/v1/realtime';
        let apiKey = this.apiKey;

        if (vendor === 'openai') {
            baseUrl = process.env.OPENAI_API_URL || 'wss://api.openai.com/v1/realtime';
            apiKey = process.env.OPENAI_API_KEY || this.apiKey;
        } else if (vendor === 'qwen') {
            baseUrl = process.env.QWEN_API_URL;
            apiKey = process.env.QWEN_API_KEY;
        } else if (vendor === 'yandex') {
            baseUrl = process.env.YANDEX_API_URL;
            apiKey = process.env.YANDEX_API_KEY;
        }

        if (!baseUrl) {
            this.logger.error(`Error initializing Connection. Base URL missing for vendor=${vendor} model=${wireModel}`);
            return;
        }

        const api_url = `${baseUrl}?model=${encodeURIComponent(wireModel)}`;

        this.logger.log(`Connecting to API: URL=${api_url} vendor=${vendor} Model=${wireModel}`);
        if (!apiKey) {
            this.logger.error('API Key is missing/empty!');
        } else {
            this.logger.log(`API Key prefix: ${apiKey.substring(0, 7)}...`);
        }

        const authPrefix = vendor === 'yandex' ? 'Api-Key' : 'Bearer';

        const headers: Record<string, string> = {
            Authorization: `${authPrefix} ${apiKey}`,
        };

        const yandexFolder = vendor === 'yandex' ? this.resolveYandexFolder() : undefined;
        if (yandexFolder) {
            headers['OpenAI-Project'] = yandexFolder;
            headers['x-folder-id'] = yandexFolder;
        }

        this.ws = new WebSocket(api_url, { headers });
        this.logger.log(`Assistant ${this.assistant.name}_${this.assistant.uniqueId} Started (${this.channelId})`);

        this.ws.on('open', () => {
            this.reconnectAttempts = 0;
            this.logger.log(`WebSocket connection established for ${this.channelId}`);
            this.eventEmitter.emit(`openai.connected.${this.channelId}`);
            this.flushQueue();
        });

        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('error', (error) => this.handleError(error));
        this.ws.on('close', () => this.handleClose());
    }

    private flushQueue() {
        while (this.sendQueue.length > 0) {
            const data = this.sendQueue.shift();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(data));
            }
        }
    }

    private handleMessage(data) {
        const event = JSON.parse(data.toString());

        // Log first message
        if (!this['firstMessageLogged']) {
            this.logger.log(`First message from OpenAI for ${this.channelId}: ${event.type}`);
            this['firstMessageLogged'] = true;
        }

        if (event?.type === 'error' && isFatalRealtimeError(event.error)) {
            this.markFatal(event.error?.message || 'fatal realtime error');
        }

        // Передаем события с привязкой к channelId
        this.eventEmitter.emit(`openai.${this.channelId}`, event);
    }

    private handleError(error: Error) {
        this.logger.error(`Assistant ${this.assistant.name} Connection Error (${this.channelId}):`, error);
    }

    /**
     * Stop reconnect loops (wrong model / auth). Emits openai.fatal so owners can hang up.
     */
    markFatal(reason: string) {
        if (this.isFatal) return;
        this.isFatal = true;
        this.isManualClose = true;
        this.clearReconnectTimer();
        this.sendQueue = [];
        this.logger.error(
            `[Connection] Fatal error for ${this.channelId} — reconnect disabled: ${reason}`,
        );
        this.eventEmitter.emit(`openai.fatal.${this.channelId}`, { reason });
        if (this.ws) {
            this.ws.removeAllListeners();
            try {
                this.ws.close();
            } catch {
                /* ignore */
            }
            this.ws = null;
        }
    }

    get isDead(): boolean {
        return this.isFatal || this.isManualClose;
    }

    send(data: any) {
        // Don't reconnect if explicitly closed (call ended / session_expired cleanup)
        if (this.isManualClose || this.isFatal) {
            this.logger.warn(`[Connection] send() called after close/fatal — discarding for ${this.channelId}`);
            return;
        }

        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.sendQueue.push(data);
            this.scheduleReconnect();
        } else if (this.ws.readyState === WebSocket.CONNECTING) {
            this.sendQueue.push(data);
        } else {
            this.ws.send(JSON.stringify(data));
        }
    }

    private scheduleReconnect() {
        if (this.isFatal || this.isManualClose) return;
        if (this.reconnectTimer) return;

        if (this.reconnectAttempts >= OpenAiConnection.MAX_RECONNECT_ATTEMPTS) {
            this.markFatal(
                `max reconnect attempts (${OpenAiConnection.MAX_RECONNECT_ATTEMPTS}) exhausted`,
            );
            return;
        }

        const delay = Math.min(
            OpenAiConnection.RECONNECT_BASE_MS * (2 ** this.reconnectAttempts),
            OpenAiConnection.RECONNECT_MAX_MS,
        );
        this.reconnectAttempts += 1;
        this.logger.warn(
            `[Connection] WebSocket down (state: ${this.ws?.readyState}). ` +
            `Reconnect #${this.reconnectAttempts} in ${delay}ms for ${this.channelId}`,
        );

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.isFatal && !this.isManualClose) {
                this.connect();
            }
        }, delay);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    close() {
        this.isManualClose = true;
        this.clearReconnectTimer();
        this.sendQueue = [];
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
    }

    private handleClose() {
        this.logger.log(`Assistant ${this.assistant.name} Connection Closed (${this.channelId})`);
        // Don't removeAllListeners on the global eventEmitter here —
        // session owners (CallSession, PlaygroundService, etc.) manage their own listeners
    }
}
