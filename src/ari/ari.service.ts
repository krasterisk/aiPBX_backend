import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as ariClient from 'ari-client';
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";
import {OpenAiService, sessionData} from "../open-ai/open-ai.service";
import {OpenAiConnection} from "../open-ai/open-ai.connection";
import {StreamAudioService} from "../audio/streamAudio.service";
import {AssistantsService} from "../assistants/assistants.service";
import {Assistant} from "../assistants/assistants.model";

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
    assistant: Assistant
}


class CallSession {
    public bridge: ariClient.Bridge
    public externalChannel: ariClient.Channel
    public playback: ariClient.Playback
    private logger = new Logger(CallSession.name)
    private readonly openAiConnection: OpenAiConnection
    private readonly audioDeltaHandler: (outAudio: Buffer, serverData: sessionData) => Promise<void>
    private readonly audioInterruptHandler: (serverData: sessionData) => Promise<void>

    constructor(
        private ari: ariClient.Client,
        private channel: ariClient.Channel,
        private externalHost: string,
        private rtpUdpServer: RtpUdpServerService,
        private openAiService: OpenAiService,
        private streamAudioService: StreamAudioService,
        private assistant: Assistant,
    ) {
        this.openAiConnection = this.openAiService.createConnection(this.channel.id, assistant)

        this.audioDeltaHandler = async (outAudio: Buffer, serverData: sessionData) => {
            const sessionId = serverData.channelId
            await this.streamAudioService.addStream(sessionId, {
                external_local_Address: serverData.address,
                external_local_Port: Number(serverData.port),
            });
            await this.streamAudioService.streamAudio(sessionId, outAudio);
        };

        this.audioInterruptHandler = async (serverData: sessionData) => {
            const sessionId = serverData.channelId
            await this.streamAudioService.removeStream(sessionId);
        };

        this.openAiService.eventEmitter.on(
            `openai.${this.channel.id}`,
            (event) => this.openAiService.dataDecode(event, this.channel.id,
                this.channel.caller.number, assistant)
        );

        this.openAiService.eventEmitter.on(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);

        this.openAiService.eventEmitter.on(`audioInterrupt.${this.channel.id}`, this.audioInterruptHandler);

        this.openAiService.eventEmitter.on(`transferToDialplan.${this.channel.id}`,
            this.redirectToDialplan.bind(this));

        this.openAiService.eventEmitter.on(`hangupCall.${this.channel.id}`,
            this.hangupCall.bind(this))
    }

    async initialize(botName: string, assistant: Assistant) {
        try {
            if (!botName) {
                this.logger.error('Error initializing call session. Bot name is empty');
                return
            }
            // Создаем мост
            this.bridge = this.ari.Bridge();
            await this.bridge.create({type: 'mixing'});
            // Добавляем входящий канал в мост
            await this.bridge.addChannel({channel: this.channel.id});
            // Создаем канал для внешнего медиа
            this.externalChannel = this.ari.Channel();
            this.externalChannel.externalMedia({
                app: botName,
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
                    assistant
                }
                if (sessionData) {
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
            await this.openAiService.dataDecode({type: 'call.hangup'}, this.channel.id, this.channel.caller.number, null)
            this.openAiService.eventEmitter.off(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);
            this.openAiService.closeConnection(this.channel.id);
            await this.streamAudioService.removeStream(this.channel.id);
        } catch (err) {
            this.logger.error('Error cleaning up session', err);
        }
    }

    async redirectToDialplan(context: string = 'sip-out0', extension: string = '200', priority: number = 1) {
        if (!this.channel) {
            this.logger.warn('Cannot redirect: channel is undefined');
            return;
        }
            await this.channel.continueInDialplan({
                context,
                extension,
                priority
            }, err => console.log(err));

                console.log(JSON.stringify(context))

            this.logger.log(`Channel ${this.channel.id} redirected to ${context},${extension},${priority}`);
    }

    async hangupCall() {
        if (!this.channel) {
            this.logger.warn('Cannot hangup: channel is undefined');
            return;
        }
            this.logger.log(`Channel ${this.channel.id} hangup`);
            await this.cleanup()
            await this.channel.hangup()
            this.logger.log(`Channel ${this.channel.id} hangup`);
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
        @Inject(StreamAudioService) private readonly streamAudioService: StreamAudioService,
        @Inject(AssistantsService) private readonly assistantsService: AssistantsService
    ) {
    }

    async onModuleInit() {
        const bots: Assistant[] = await this.assistantsService.getAll('0', true)
        if (!bots) {
            this.logger.error('Error getting bots list');
            return
        }
        for (const assistant of bots) {
            await this.connectToARI(assistant);
        }


    }

    private async connectToARI(assistant: Assistant) {
        if (!assistant.id) {
            this.logger.warn(`Can't connect to assistant ${assistant.name}`);
            return;
        }

        const ari = await ariClient.connect(this.url, this.username, this.password);
        const botName = 'voiceBot' + '_' + String(assistant.id)
        await ari.start(botName);

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
                    this.streamAudioService,
                    assistant
                );

                this.sessions.set(incoming.id, session);

                await session.initialize(botName, assistant);

                incoming.on('StasisEnd', (event, channel) => {

                });

            } catch (err) {
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

        ari.on('ChannelDialplan', (event, channel) => {
            try {
                console.log(event,channel)
            } catch (e) {
                console.log(e,event,channel)
            }
        })
    }

}
