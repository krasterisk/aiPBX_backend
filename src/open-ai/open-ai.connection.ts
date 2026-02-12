import { WebSocket } from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Assistant } from "../assistants/assistants.model";
import { Logger } from "@nestjs/common";

export class OpenAiConnection {
    private ws: WebSocket;
    private sendQueue: any[] = [];
    private isManualClose = false;

    private readonly logger = new Logger(OpenAiConnection.name);

    constructor(
        private readonly apiKey: string,
        private readonly channelId: string,
        private readonly eventEmitter: EventEmitter2,
        private readonly assistant: Assistant
    ) {
        this.connect();
    }

    private connect() {
        this.isManualClose = false;

        if (!this.assistant) {
            this.logger.error('Error initializing OpenAi Connection. Assistant is not configured');
            return
        }

        if (!this.assistant.model) {
            this.logger.error('Error initializing OpenAi Connection. Model name is empty');
            return
        }

        // Clean up old WebSocket before creating a new one
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
        }
        this.sendQueue = [];

        let model = this.assistant.model || 'gpt-realtime-mini'
        let baseUrl = 'wss://api.openai.com/v1/realtime';
        let apiKey = this.apiKey;

        if (model.startsWith('gpt')) {
            baseUrl = process.env.OPENAI_API_URL || 'wss://api.openai.com/v1/realtime';
            apiKey = process.env.OPENAI_API_KEY || this.apiKey;
        } else if (model.startsWith('qwen')) {
            baseUrl = process.env.QWEN_API_URL;
            apiKey = process.env.QWEN_API_KEY;
        } else if (model.startsWith('yandex')) {
            baseUrl = process.env.YANDEX_API_URL;
            apiKey = process.env.YANDEX_API_KEY;
            model = process.env.YANDEX_MODEL;
        }

        if (!baseUrl) {
            this.logger.error(`Error initializing Connection. Base URL missing for model: ${model}`);
            return;
        }

        const api_url = baseUrl + '?model=' + model

        this.logger.log(`Connecting to API: URL=${api_url} Model=${model}`);
        if (!apiKey) {
            this.logger.error('API Key is missing/empty!');
        } else {
            this.logger.log(`API Key prefix: ${apiKey.substring(0, 7)}...`);
        }

        const authPrefix = this.assistant.model?.startsWith('yandex') ? 'Api-Key' : 'Bearer';

        this.ws = new WebSocket(api_url, {
            headers: {
                Authorization: `${authPrefix} ${apiKey}`,
                "OpenAI-Beta": "realtime=v1"

            }
        });
        this.logger.log(`Assistant ${this.assistant.name}_${this.assistant.uniqueId} Started (${this.channelId})`);

        this.ws.on('open', () => {
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

        // Передаем события с привязкой к channelId
        this.eventEmitter.emit(`openai.${this.channelId}`, event);
    }

    private handleError(error: Error) {
        this.logger.error(`Assistant ${this.assistant.name} Connection Error (${this.channelId}):`, error);
    }

    send(data: any) {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.logger.warn(`[Connection] WebSocket closed/closing (state: ${this.ws?.readyState}). Reconnecting for ${this.channelId}...`);
            this.connect();
            this.sendQueue.push(data);
        } else if (this.ws.readyState === WebSocket.CONNECTING) {
            this.sendQueue.push(data);
        } else {
            this.ws.send(JSON.stringify(data));
        }
    }

    close() {
        this.isManualClose = true;
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
