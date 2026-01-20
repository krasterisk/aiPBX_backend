import { WebSocket } from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Assistant } from "../assistants/assistants.model";
import { Logger } from "@nestjs/common";

export class OpenAiConnection {
    private ws: WebSocket;
    private readonly API_RT_URL = 'wss://api.openai.com/v1/realtime';
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

        if (!this.assistant) {
            this.logger.error('Error initializing OpenAi Connection. Assistant is not configured');
            return
        }

        if (!this.assistant.model) {
            this.logger.error('Error initializing OpenAi Connection. Model name is empty');
            return
        }

        let model = this.assistant.model || 'gpt-realtime-mini'

        const api_url = this.API_RT_URL + '?model=' + model

        this.logger.log(`Connecting to OpenAI Realtime API: URL=${api_url} Model=${model}`);
        if (!this.apiKey) {
            this.logger.error('API Key is missing/empty!');
        } else {
            this.logger.log(`API Key prefix: ${this.apiKey.substring(0, 7)}...`);
        }

        this.ws = new WebSocket(api_url, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "OpenAI-Beta": "realtime=v1",
            }
        });
        this.logger.log(`Assistant ${this.assistant.name}_${this.assistant.uniqueId} Started (${this.channelId})`);

        this.ws.on('open', () => {
            this.logger.log(`WebSocket connection established for ${this.channelId}`);
            this.eventEmitter.emit(`openai.connected.${this.channelId}`);
        });

        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('error', (error) => this.handleError(error));
        this.ws.on('close', () => this.handleClose());
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

    private handleClose() {
        this.logger.log(`Assistant ${this.assistant.name} Connection Closed (${this.channelId})`);
        this.eventEmitter.removeAllListeners(`openai.${this.channelId}`);
    }
    send(data: any) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            this.logger.warn(`[Connection] Cannot send data, WebSocket state is ${this.ws.readyState} (not OPEN) for ${this.channelId}`);
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
