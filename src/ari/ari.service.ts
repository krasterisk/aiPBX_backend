import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as ariClient from 'ari-client';
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";
import {OpenAiService, sessionData} from "../open-ai/open-ai.service";
import {OpenAiConnection} from "../open-ai/open-ai.connection";
import {StreamAudioService} from "../audio/streamAudio.service";

interface chanVars {
    UNICASTRTP_LOCAL_PORT: number
    UNICASTRTP_LOCAL_ADDRESS: string
}

interface channelData {
    channelId: string
    address: string
    port: string
    init: string
    openAiConn: OpenAiConnection
}


class CallSession {
    public bridge: ariClient.Bridge
    public externalChannel: ariClient.Channel
    public playback: ariClient.Playback
    private logger = new Logger(CallSession.name)
    private readonly openAiConnection: OpenAiConnection
    private readonly audioDeltaHandler: (outAudio: Buffer, serverData: sessionData) => Promise<void>


    constructor(
        private ari: ariClient.Client,
        private channel: ariClient.Channel,
        private externalHost: string,
        private rtpUdpServer: RtpUdpServerService,
        private openAiService: OpenAiService,
        private streamAudioService: StreamAudioService
    ) {
        this.openAiConnection = this.openAiService.createConnection(this.channel.id)

        this.audioDeltaHandler = async (outAudio: Buffer, serverData: sessionData) => {
            const sessionId = serverData.channelId
            await this.streamAudioService.addStream(sessionId, {
                external_local_Address: serverData.address,
                external_local_Port: Number(serverData.port),
            });
            await this.streamAudioService.streamAudio(sessionId, outAudio);
        };


        this.openAiService.eventEmitter.on(
            `openai.${this.channel.id}`,
            (event) => this.openAiService.dataDecode(event, this.channel.id, this.channel.caller.number)
        );

        this.openAiService.eventEmitter.on(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);

    }

    async initialize() {
            try {
            // Создаем мост
            this.bridge = this.ari.Bridge();
            await this.bridge.create({ type: 'mixing' });
            // Добавляем входящий канал в мост
            await this.bridge.addChannel({ channel: this.channel.id });
            // Создаем канал для внешнего медиа
            this.externalChannel = this.ari.Channel();
            this.externalChannel.externalMedia({
                app: 'voicebot',
                external_host: this.externalHost,
                format: 'alaw'
            }).then((chan) => {
                const channelVars = chan.channelvars as chanVars;
                this.logger.log('channelsVars is: ', channelVars);
                this.logger.log('External Host is: ', this.externalHost);
                this.bridge.addChannel({channel: chan.id});
                const sessionUrl = `${channelVars.UNICASTRTP_LOCAL_ADDRESS}:${channelVars.UNICASTRTP_LOCAL_PORT}`
                const sessionData: channelData = {
                    channelId: this.channel.id,
                    address: channelVars.UNICASTRTP_LOCAL_ADDRESS,
                    port: String(channelVars.UNICASTRTP_LOCAL_PORT),
                    init: 'false',
                    openAiConn: this.openAiConnection,
                }
                if(sessionData) {
                    this.rtpUdpServer.sessions.set(sessionUrl, sessionData)
                }

            });

            this.playback = this.ari.Playback();
            await this.channel.play({
                media: 'sound:hello-world',
                lang: 'ru'
            }, this.playback);

        } catch (err) {
            this.logger.error('Error initializing call session', err);
            await this.cleanup();
        }
    }

async cleanup() {
        try {
            if (this.bridge.id !== undefined) {
                await this.bridge.destroy();
            }
            if (this.externalChannel.id !== undefined) {
                await this.externalChannel.hangup();
            }
            this.openAiService.eventEmitter.off('audioDelta', this.audioDeltaHandler);
            this.openAiService.closeConnection(this.channel.id);
            await this.streamAudioService.removeStream(this.channel.id);
        } catch (err) {
            this.logger.error('Error cleaning up session', err);
        }
    }
}

@Injectable()
export class AriService implements OnModuleInit {
    private url = process.env.ARI_URL
    private username = process.env.ARI_USER;
    private password = process.env.ARI_PASS;
    private externalHost = process.env.ARI_EXTERNAL_HOST;
    private readonly logger = new Logger();

    private sessions = new Map<string, CallSession>();

    constructor(
        @Inject(RtpUdpServerService) private rtpUdpServer: RtpUdpServerService,
        @Inject(OpenAiService) private openAiServer: OpenAiService,
        @Inject(StreamAudioService) private readonly streamAudioService: StreamAudioService
        ) {}

    async onModuleInit() {
            // Подключаемся к ARI
                await this.connectToARI();
    }

    private async connectToARI() {
        const ari = await ariClient.connect(this.url, this.username, this.password);
        await ari.start('voicebot');

        ari.on('StasisStart', async (event, incoming) => {
            if (this.sessions.has(incoming.id)) {
                this.logger.warn(`Session already exists for channel ${incoming.id}`);
                return;
            }

            if (incoming.name.startsWith('UnicastRTP/')) {
                this.logger.log(`Ignoring external media channel: ${incoming.id}`);
                return;
            }

            try {
                const session = new CallSession(
                    ari,
                    incoming,
                    this.externalHost,
                    this.rtpUdpServer,
                    this.openAiServer,
                    this.streamAudioService
                );

                this.sessions.set(incoming.id, session);

                console.log("STARTING: ", incoming.id)
                await session.initialize();

                incoming.on('StasisEnd', (event, channel) => {

                });

            } catch (err) {
                console.log(err)
                this.logger.error('Error handling new call', err);
            }
        });

        ari.on('StasisEnd', (event, channel) => {
            try {
                const session = this.sessions.get(channel.id);
                if (session) {
                    session.cleanup();
                    this.sessions.delete(channel.id);
                }
            } catch (e) {
                this.logger.error('Error from stasis end', e);
            }

        })
    }

    private streamAudioFromChannel(channel) {
        console.log('WebSocket connection established for audio streaming');
        channel.externalMedia({
            app: 'voicebot',
            external_host: this.externalHost,
            format: 'alaw',
        })
        console.log('externalMedia Channel: ', channel)
        // this.wsGateway.handleMessage('message', channel.data)
    }

    public async getEndpoints() {
        // try {
        //     // const endpoints_list = await this.client.endpoints.list()
        //     return endpoints_list.map((endpoint: { technology: any; resource: any; state: any; channel_ids: any; }) => ({
        //         technology: endpoint.technology,
        //         resource: endpoint.resource,
        //         state: endpoint.state,
        //         channel_id: endpoint.channel_ids
        //     }))
        // } catch (e) {
        //     console.log("error: " + e)
        // }
    }

}



