import { Logger } from '@nestjs/common';
import { RtpUdpServerService } from '../rtp-udp-server/rtp-udp-server.service';
import { OpenAiService } from '../open-ai/open-ai.service';
import { StreamAudioService } from '../audio/streamAudio.service';
import { AssistantsService } from '../assistants/assistants.service';
import { CallSession } from './call-sessions';
import { PbxServers } from '../pbx-servers/pbx-servers.model';
import { AriHttpClient } from './ari-http-client';
import { WebSocket } from 'ws';

export interface ChannelData {
    id: string,
    name: string,
    state: string,
    callerId: string,
    dialplan: string,
    creationtime: string
};


export class AriConnection {
    private readonly logger = new Logger(AriConnection.name);
    private sessions = new Map<string, CallSession>();
    private ariClient: AriHttpClient;
    private webSocket: WebSocket | null = null;
    private stasisBotName: string;

    constructor(
        private readonly pbxServer: PbxServers,
        private readonly rtpUdpServer: RtpUdpServerService,
        private readonly openAiService: OpenAiService,
        private readonly streamAudioService: StreamAudioService,
        private readonly assistantsService: AssistantsService,
    ) {
        this.logger.log(`Creating AriConnection for server: ${pbxServer.id} - ${pbxServer.ari_url}`);
        this.logger.log(`ARI User: ${pbxServer.ari_user}`);
    }

    async connect() {
        try {
            this.stasisBotName = `${process.env.AIPBX_BOTNAME}_${this.pbxServer.id}`;

            if (!this.stasisBotName) {
                throw new Error(`AI botName is empty!`);
            }

            // Создаем HTTP клиент ARI
            this.ariClient = new AriHttpClient(
                this.pbxServer.ari_url,
                this.pbxServer.ari_user,
                this.pbxServer.password,
                this.stasisBotName
            );

            // Тестируем подключение
            const isConnected = await this.ariClient.testConnection();
            if (!isConnected) {
                throw new Error(`Failed to connect to ARI server`);
            }

            // Подключаем WebSocket для получения событий
            await this.connectWebSocket();


        } catch (err: any) {
            this.logger.error(`Error connecting to ${this.pbxServer.ari_url}:`, err.message);
            throw err;
        }
    }

    private async connectWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Формируем правильный URL с параметрами авторизации
            const url = new URL(this.pbxServer.ari_url);
            const wsUrl = `ws://${url.hostname}:${url.port || 8088}/ari/events`;

            // Добавляем параметры аутентификации в query string
            const wsUrlWithAuth = `${wsUrl}?api_key=${this.pbxServer.ari_user}:${this.pbxServer.password}&app=${this.stasisBotName}`;
            this.webSocket = new WebSocket(wsUrlWithAuth);

            this.webSocket.on('open', () => {
                this.logger.log(`WebSocket connected bot ${this.stasisBotName} to ${this.pbxServer.name}(${this.pbxServer.location})`);

                // Подписываемся на события для нашего приложения
                this.webSocket?.send(JSON.stringify({
                    "operation": "subscribe",
                    "app": this.stasisBotName
                }));

                resolve();
            });

            this.webSocket.on('message', (data: Buffer) => {
                try {
                    const event = JSON.parse(data.toString());
                    this.handleAriEvent(event);
                } catch (err) {
                    this.logger.error(`Error parsing WebSocket message from ${this.pbxServer.name}:`, err);
                }
            });

            this.webSocket.on('error', (err) => {
                this.logger.error(`WebSocket error for ${this.pbxServer.name}:`, err);
                reject(err);
            });

            this.webSocket.on('close', () => {
                this.logger.log(`WebSocket disconnected for ${this.pbxServer.name}`);

                // Reconnect logic after 5 seconds
                setTimeout(() => {
                    if (this.webSocket) { // Only reconnect if it wasn't intentionally cleared
                        this.logger.log(`Attempting to reconnect WebSocket for ${this.pbxServer.name}...`);
                        this.connectWebSocket().catch(err => {
                            this.logger.error(`Failed to reconnect WebSocket for ${this.pbxServer.name}:`, err);
                        });
                    }
                }, 5000);
            });
        });
    }

    private async handleAriEvent(event: any): Promise<void> {
        // this.logger.debug(`Received ARI event: ${event.type}`);
        try {
            switch (event.type) {
                case 'StasisStart':
                    await this.handleStasisStart(event);
                    break;

                case 'StasisEnd':
                    await this.handleStasisEnd(event);
                    break;

                case 'ChannelVarset':
                    this.handleChannelVarset(event);
                    break;

                default:
                    // Логируем другие события для отладки
                    // if (process.env.NODE_ENV === 'development') {
                    //     this.logger.debug(`Received ARI event: ${event.type}`);
                    // }
                    break;
            }
        } catch (err) {
            this.logger.error(`Error handling ARI event ${event.type}:`, err);
        }
    }

    private async handleStasisStart(event: any): Promise<void> {

        const channelId = event.channel?.id;

        if (!channelId) {
            this.logger.warn('StasisStart event without channel id');
            return;
        }

        const args = event.args || [];

        // Checking on exist channelId
        if (this.sessions.has(channelId)) {
            this.logger.warn(`Session already exists for channel ${channelId}`);
            return;
        }

        // Checking on exist channelId (second leg)
        if (event.channel?.name.startsWith('UnicastRTP/')) {
            this.logger.warn(`Second leg already exists for channel ${channelId}`);
            return;
        }

        // Checking for snoop channel
        if (event.channel?.name.startsWith('Snoop/')) {
            this.logger.debug(`Ignore snoop channel ${channelId}`);
            return;
        }

        // Checking for working appArgs
        if (args.includes('moh-whisper')) {
            this.logger.debug(`Ignore MOH snoop StasisStart`);
            return;
        }

        try {

            const botName = event.application;
            const uniqueId = event.args[0];

            if (!uniqueId) {
                this.logger.error(`No uniqueId for Assistant passed for ${channelId}`);
                await this.ariClient.hangupChannel(channelId);
                return;
            }

            if (!botName) {
                this.logger.error(`No botName for Assistant passed for ${channelId}`);
                await this.ariClient.hangupChannel(channelId);
                return;
            }

            const assistant = await this.assistantsService.getByUniqueId(uniqueId);
            if (!assistant) {
                this.logger.warn(`Assistant not found for uniqueId: ${uniqueId}`);
                await this.ariClient.hangupChannel(channelId);
                return;
            }
            this.logger.log(`Starting ari connections for: ${assistant.name}_${assistant.id}_${uniqueId}`)
            const externalHost = process.env.EXTERNAL_HOST;
            if (!externalHost) {
                this.logger.warn(`External host is empty!`);
                await this.ariClient.hangupChannel(channelId);
                return;
            }

            // Получаем полные данные канала из события
            const channelData: ChannelData = {
                id: channelId,
                name: event.channel?.name || '',
                state: event.channel?.state || '',
                callerId: event.channel?.caller?.number || '',
                dialplan: event.channel?.dialplan || '',
                creationtime: event.channel?.creationtime || new Date().toISOString()
            };

            this.logger.log(`Starting new call session for channel ${channelId}`);

            const session = new CallSession(
                this,
                channelData,
                externalHost,
                this.rtpUdpServer,
                this.openAiService,
                this.streamAudioService,
                assistant,
                this.ariClient,
                this.pbxServer
            );

            this.sessions.set(channelId, session);

            await session.init();

        } catch (err) {
            this.logger.error(`Error handling StasisStart for channel ${channelId}:`, err);
            try {
                await this.ariClient.hangupChannel(channelId);
            } catch (hangupError) {
                // Игнорируем ошибку при завершении вызова
            }
        }
    }

    private async handleStasisEnd(event: any): Promise<void> {
        const channelId = event.channel?.id;

        if (!channelId) {
            this.logger.warn('StasisEnd event without channel id');
            return;
        }

        await this.cleanupSession(channelId);
    }

    private handleChannelVarset(event: any): void {
        // Можно добавить обработку установки переменных канала
        // Например, для получения RTP параметров
        const channelId = event.channel?.id;
        const variable = event.variable;
        const value = event.value;

        if (variable === 'UNICASTRTP_LOCAL_ADDRESS' || variable === 'UNICASTRTP_LOCAL_PORT') {
            this.logger.debug(`Установка переменных канала: ${event}`);

            // Обновляем параметры RTP в соответствующей сессии
            const session = this.sessions.get(channelId);
            if (session) {
                // Здесь можно вызвать метод обновления RTP параметров в сессии
                // session.updateRtpParams(variable, value);
            }
        }
    }

    private async cleanupSession(channelId: string) {
        if (!channelId) return;

        const session = this.sessions.get(channelId);
        if (!session) return;

        try {
            this.logger.log(`Cleaning up session for channel ${channelId}`);
            await session.cleanup();
        } catch (err) {
            this.logger.error(`Error cleaning up session for ${channelId}`, err);
        } finally {
            this.sessions.delete(channelId);
        }
    }

    getAriClient(): AriHttpClient {
        return this.ariClient;
    }

    getAppName(): string {
        return this.stasisBotName;
    }

    getServerId(): string {
        return this.pbxServer.id;
    }

    async disconnect(): Promise<void> {
        // Закрываем все активные сессии
        for (const [channelId, session] of this.sessions) {
            try {
                await session.cleanup();
            } catch (err) {
                this.logger.error(`Error cleaning up session ${channelId} during disconnect`, err);
            }
        }
        this.sessions.clear();

        // Закрываем WebSocket
        if (this.webSocket) {
            this.webSocket.close();
            this.webSocket = null;
        }

        this.logger.log(`Disconnected from ARI server: ${this.pbxServer.name}`);
    }
}
