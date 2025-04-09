import { WebSocket } from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';

export class OpenAiConnection {
    private ws: WebSocket;
    private readonly API_RT_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17';

    constructor(
        private readonly apiKey: string,
        private readonly channelId: string,
        private readonly eventEmitter: EventEmitter2
    ) {
        this.connect();
    }

    private connect() {
        this.ws = new WebSocket(this.API_RT_URL, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "OpenAI-Beta": "realtime=v1",
            }
        });
        console.log(`OpenAI Connection Started (${this.channelId})`);

        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('error', (error) => this.handleError(error));
        this.ws.on('close', () => this.handleClose());
    }

    private handleMessage(data) {
        const event = JSON.parse(data.toString());
        // Передаем события с привязкой к channelId
        this.eventEmitter.emit(`openai.${this.channelId}`, event);
    }

    private handleError(error: Error) {
        console.error(`OpenAI Connection Error (${this.channelId}):`, error);
    }

    private handleClose() {
        console.log(`OpenAI Connection Closed (${this.channelId})`);
        this.eventEmitter.removeAllListeners(`openai.${this.channelId}`);
    }

    send(data: any) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
