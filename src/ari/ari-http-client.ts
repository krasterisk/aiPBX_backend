// ari-http-client.ts
import axios, { AxiosInstance } from 'axios';

export interface AriEvent {
    type: string;
    [key: string]: any;
}

export interface Bridge {
    id: string;
    bridge_type: string;
    bridge_class: string;
    creator: string;
    name: string;
    channels: string[];
    technology: string;
    creationtime: string;
}

export interface Channel {
    id: string;
    name: string;
    state: string;
    caller: {
        name: string;
        number: string;
    };
    connected: {
        name: string;
        number: string;
    };
    creationtime: string;
    language: string;
    accountcode: string;
    peer: string;
    dialplan: {
        context: string;
        exten: string;
        priority: number;
        app_name: string;
        app_data: string;
    };
    channelvars?: any
}

export class AriHttpClient {
    private client: AxiosInstance;
    private readonly baseURL: string;

    constructor(
        private readonly url: string,
        private readonly username: string,
        private readonly password: string,
        private readonly appName: string
    ) {
        this.baseURL = url.replace(/\/+$/, '');

        this.client = axios.create({
            baseURL: this.baseURL,
            auth: { username, password },
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });
    }

    // ==================== Connection Test ====================
    async testConnection(): Promise<boolean> {
        try {
            const response = await this.client.get(this.baseURL + '/asterisk/info');
            return response.status === 200;
        } catch (error) {
            console.error('ARI connection test failed:', error);
            return false;
        }
    }

    // ==================== Bridge Operations ====================
    async createBridge(type: string = 'mixing'): Promise<Bridge> {
        const response = await this.client.post(this.baseURL + '/bridges', { type });
        return response.data;
    }

    async addChannelToBridge(bridgeId: string, channelId: string): Promise<void> {
        await this.client.post(this.baseURL + `/bridges/${bridgeId}/addChannel`, { channel: channelId });
    }

    async removeChannelFromBridge(bridgeId: string, channelId: string): Promise<void> {
        await this.client.post(this.baseURL + `/bridges/${bridgeId}/removeChannel`, { channel: channelId });
    }

    async destroyBridge(bridgeId: string): Promise<void> {
        await this.client.delete(this.baseURL + `/bridges/${bridgeId}`);
    }

    async getBridge(bridgeId: string): Promise<Bridge> {
        const response = await this.client.get(this.baseURL + `/bridges/${bridgeId}`);
        return response.data;
    }

    // ==================== Channel Operations ====================
    async createChannel(endpoint: string, app: string, appArgs?: string): Promise<Channel> {
        const params: any = {
            endpoint,
            app,
            appArgs: appArgs || ''
        };

        const response = await this.client.post(this.baseURL + '/channels/create', params);
        return response.data;
    }

    async continueChannel(channelId: string): Promise<void> {
        await this.client.post(this.baseURL + `/channels/${channelId}/continue`);
    }

    async answerChannel(channelId: string): Promise<void> {
        await this.client.post(this.baseURL + `/channels/${channelId}/answer`);
    }

    async hangupChannel(channelId: string, reason: string = 'normal'): Promise<void> {
        await this.client.delete(this.baseURL + `/channels/${channelId}`, {
            params: { reason }
        });
    }

    async getChannel(channelId: string): Promise<Channel> {
        const response = await this.client.get(this.baseURL + `/channels/${channelId}`);
        return response.data;
    }

    async redirectChannel(channelId: string, context: string, extension: string, priority: number = 1): Promise<void> {
        await this.client.post(this.baseURL + `/channels/${channelId}/redirect`, {
            context,
            extension,
            priority
        });
    }

    async playMedia(channelId: string, media: string, lang: string = 'ru'): Promise<string> {
        const response = await this.client.post(this.baseURL + `/channels/${channelId}/play`, {
            media: `sound:${media}`,
            lang
        });
        return response.data.id;
    }

    async stopPlayback(playbackId: string): Promise<void> {
        await this.client.delete(this.baseURL + `/playbacks/${playbackId}`);
    }

    // ==================== External Media ====================
    async externalMedia(
        channelId: string,
        app: string,
        externalHost: string,
        format: string = 'alaw',
        data: string
    ): Promise<Channel> {
        const response = await this.client.post(this.baseURL + `/channels/externalMedia`, {
            channelId,
            app,
            external_host: externalHost,
            format,
            data
        });
        return response.data;
    }
    // ==================== Utility Methods ====================
    async getAsteriskInfo(): Promise<any> {
        const response = await this.client.get(this.baseURL + '/asterisk/info');
        return response.data;
    }

    getBaseUrl(): string {
        return this.baseURL;
    }

    getAppName(): string {
        return this.appName;
    }
}
