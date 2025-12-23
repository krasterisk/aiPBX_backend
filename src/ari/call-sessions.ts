import { OpenAiConnection } from "../open-ai/open-ai.connection";
import { Assistant } from "../assistants/assistants.model";
import { Logger } from "@nestjs/common";
import { OpenAiService, sessionData } from "../open-ai/open-ai.service";
import { RtpUdpServerService } from "../rtp-udp-server/rtp-udp-server.service";
import { StreamAudioService } from "../audio/streamAudio.service";
import {AriConnection, ChannelData} from "./ari-connection";
import { PbxServers } from "../pbx-servers/pbx-servers.model";
import { AriHttpClient, Bridge, Channel } from "./ari-http-client";

interface ChanVars {
    UNICASTRTP_LOCAL_PORT: number;
    UNICASTRTP_LOCAL_ADDRESS: string;
}

interface SessionData {
    channelId: string;
    callerId: string;
    address: string;
    port: string;
    init: string;
    openAiConn: OpenAiConnection;
    assistant: Assistant;
}

export class CallSession {
    public bridge: Bridge;
    public externalChannel: Channel;
    private logger = new Logger(CallSession.name);
    private openAiConnection: OpenAiConnection;
    private audioDeltaHandler: (outAudio: Buffer, serverData: sessionData) => Promise<void>;
    private audioInterruptHandler: (serverData: sessionData) => Promise<void>;
    private cleanedUp = false;
    private readonly connectionId: string;

    constructor(
        private readonly ariConnection: AriConnection,
        private readonly channel: ChannelData,
        private externalHost: string,
        private rtpUdpServer: RtpUdpServerService,
        private openAiService: OpenAiService,
        private streamAudioService: StreamAudioService,
        private assistant: Assistant,
        private readonly ariClient: AriHttpClient,
        private readonly pbxServer: PbxServers
    ) {
        this.connectionId = `${this.pbxServer.id}-${Date.now()}`;
        this.logger.log(`[${this.connectionId}] Creating connection for channel: ${channel.id}`);
    }

    async init(): Promise<void> {
        this.openAiConnection = await this.openAiService.createConnection(
            this.channel.id,
            this.assistant
        );

        await this.registerOpenAiHandlers();
        await this.initializeAri(this.assistant)
    }

    private registerOpenAiHandlers() {

        this.audioDeltaHandler = async (outAudio: Buffer, serverData: sessionData) => {
            const sessionId = serverData.channelId;
            await this.streamAudioService.addStream(sessionId, {
                external_local_Address: serverData.address,
                external_local_Port: Number(serverData.port),
            });
            await this.streamAudioService.streamAudio(sessionId, outAudio);
        };

        this.audioInterruptHandler = async (serverData: sessionData) => {
            const sessionId = serverData.channelId;
            await this.streamAudioService.interruptStream(sessionId);
        };

        this.openAiService.eventEmitter.on(
            `openai.${this.channel.id}`,
            (event) => this.openAiService.dataDecode(
                event,
                this.channel.id,
                this.channel.callerId || '',
                this.assistant
            )
        );

        this.openAiService.eventEmitter.on(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);
        this.openAiService.eventEmitter.on(`audioInterrupt.${this.channel.id}`, this.audioInterruptHandler);

        this.openAiService.eventEmitter.on(
            `transferToDialplan.${this.channel.id}`,
            (params) => this.redirectToDialplan(params)
        );

        this.openAiService.eventEmitter.on(
            `HangupCall.${this.channel.id}`,
            () => this.hangupCall()
        );
    }

    async initializeAri(assistant: Assistant) {
        try {
            // 1. Создаем bridge
            const bridgeData = await this.ariClient.createBridge('mixing');
            this.bridge = bridgeData;

            // 2. Добавляем основной канал в bridge
            await this.ariClient.addChannelToBridge(this.bridge.id, this.channel.id);

            // 3. Отвечаем на основной канал
            await this.ariClient.answerChannel(this.channel.id);

            // 4. ПРЯМОЕ СОЗДАНИЕ EXTERNAL MEDIA КАНАЛА
            // Asterisk позволяет создать канал сразу с external media
            this.externalChannel = await this.ariClient.externalMedia(
                null,
                this.ariConnection.getAppName(),
                this.externalHost,
                'alaw',
                assistant.uniqueId
            );

            // 5. Добавляем external media канал в bridge
            await this.ariClient.addChannelToBridge(this.bridge.id, this.externalChannel.id);

            // 6. Получаем RTP параметры из переменных канала
            const vars = this.externalChannel.channelvars || {};

            const rtpAddress = vars.UNICASTRTP_LOCAL_ADDRESS || this.externalHost;
            const rtpPort = vars.UNICASTRTP_LOCAL_PORT;

            // 7. Настраиваем сессию RTP
            const sessionUrl = `${rtpAddress}:${rtpPort}`;

            const sessionData: SessionData = {
                channelId: this.channel.id,
                callerId: this.channel.callerId || '',
                address: rtpAddress,
                port: String(rtpPort),
                init: 'false',
                openAiConn: this.openAiConnection,
                assistant
            };

            await this.ariClient.playMedia(this.channel.id, 'hello-world', 'en');

            // 8. Запускаем потоковую передачу
            await this.startStreaming(sessionUrl,sessionData);
            this.logger.log(`Call session initialized successfully for channel ${this.channel.id}`);

        } catch (err) {
            this.logger.error('Error in initialize:', err.response.data);
            throw 'ERR'
        }
    }

    async cleanup() {
        if (this.cleanedUp) return;
        this.cleanedUp = true;

        try {
            this.logger.log(`[${this.connectionId}] Cleaning up session for channel ${this.channel.id}`);

            // Удаляем bridge
            if (this.bridge?.id) {
                try {
                    await this.ariClient.destroyBridge(this.bridge.id);
                    this.logger.log(`Bridge ${this.bridge.id} destroyed`);
                } catch (err) {
                    this.logger.warn(`Failed to destroy bridge ${this.bridge?.id}:`, err.response.data);
                }
            }

            // Завершаем внешний канал
            if (this.externalChannel?.id) {
                try {
                    await this.ariClient.hangupChannel(this.externalChannel.id);
                    this.logger.log(`External channel ${this.externalChannel.id} hung up`);
                } catch (err) {
                    this.logger.warn(`Failed to hangup external channel ${this.externalChannel?.id}:`, err.response.data);
                }
            }

            // Очищаем OpenAI
            if (this.channel?.id) {
                await this.openAiService.dataDecode(
                    { type: 'call.hangup' },
                    this.channel.id,
                    this.channel?.callerId || '',
                    null
                );

                this.openAiService.eventEmitter.off(
                    `audioDelta.${this.channel.id}`,
                    this.audioDeltaHandler
                );

                this.openAiService.eventEmitter.off(
                    `audioInterrupt.${this.channel.id}`,
                    this.audioInterruptHandler
                );

                await this.openAiService.closeConnection(this.channel.id);

                await this.streamAudioService.removeStream(this.channel.id);
                await this.rtpUdpServer.handleSessionEnd(this.channel.id);
            }

            this.logger.log(`[${this.connectionId}] Session cleanup completed`);

        } catch (err) {
            this.logger.error('Error during session cleanup:', err.response.data);
        }
    }

    async redirectToDialplan(params: any) {
        if (!this.channel) {
            this.logger.warn('Cannot redirect: channel is undefined');
            return;
        }

        const {
            context = 'sip-out0',
            extension,
            priority = 1,
        } = params;

        if (!extension) {
            this.logger.warn('Cannot redirect: extension is empty');
            return;
        }

        try {
            await this.ariClient.redirectChannel(this.channel.id, context, extension, priority);
            this.logger.log(`Channel ${this.channel.id} redirected to ${context},${extension},${priority}`);
        } catch (err) {
            this.logger.error('Failed to redirect channel:', err.response.data);
        }
    }

    async hangupCall() {
        if (!this.channel) {
            this.logger.warn('Cannot hangup: channel is undefined');
            return;
        }

        try {
            await this.ariClient.hangupChannel(this.channel.id);
            this.logger.log(`Channel ${this.channel.id} hung up`);
        } catch (err) {
            this.logger.error('Failed to hangup channel:', err.response.data);
        }
    }

    async startStreaming(sessionUrl: string, udpSession: SessionData) {
        //
        // Starting upd streaming
        if (!udpSession.channelId) {
            this.logger.error('Error start UPD streaming: no channelId');
            return
        }

        this.rtpUdpServer.sessions.set(sessionUrl, udpSession);

    }
}
