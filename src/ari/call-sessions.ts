import {OpenAiConnection} from "../open-ai/open-ai.connection";
import {Assistant} from "../assistants/assistants.model";
import * as ariClient from "ari-client";
import {Logger} from "@nestjs/common";
import {OpenAiService, sessionData} from "../open-ai/open-ai.service";
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";
import {StreamAudioService} from "../audio/streamAudio.service";

interface chanVars {
    UNICASTRTP_LOCAL_PORT: number
    UNICASTRTP_LOCAL_ADDRESS: string
}

interface channelData {
    channelId: string
    callerId: string
    address: string
    port: string
    init: string
    openAiConn: OpenAiConnection
    assistant: Assistant
}

export class CallSession {
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
            await this.streamAudioService.interruptStream(sessionId);
        };

        this.openAiService.eventEmitter.on(
            `openai.${this.channel.id}`,
            (event) => this.openAiService.dataDecode(event, this.channel.id,
                this.channel.caller.number, assistant)
        );

        this.openAiService.eventEmitter.on(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);

        this.openAiService.eventEmitter.on(`audioInterrupt.${this.channel.id}`, this.audioInterruptHandler);

        this.openAiService.eventEmitter.on(`transferToDialplan.${this.channel.id}`,
            (params) => this.redirectToDialplan(params))

        this.openAiService.eventEmitter.on(`HangupCall.${this.channel.id}`,
            this.hangupCall.bind(this))
    }

    async initialize(assistant: Assistant) {
        try {
            if (!assistant.id) {
                this.logger.error('Error initializing call session. Assistant is empty');
                return
            }

            try {
                // Создаем мост
                this.bridge = this.ari.Bridge();
                await this.bridge.create({type: 'mixing'});
                // Добавляем входящий канал в мост
                await this.bridge.addChannel({channel: this.channel.id});
                // Создаем канал для внешнего медиа
                this.externalChannel = this.ari.Channel();
            } catch (e) {
                this.logger.error('Creating bridge error: '+e)
            }

            const botName = process.env.AIPBX_BOTNAME
            if(!botName) {
                this.logger.error(`AI botName is empty!`);
                return;
            }
            this.externalChannel.externalMedia({
                app: botName,
                external_host: this.externalHost,
                // format: 'slin16'
                format: 'alaw'
            }).then((chan) => {
                const channelVars = chan.channelvars as chanVars;
                this.logger.log('channelsVars is: ', channelVars);
                this.logger.log('External Host is: ', this.externalHost);
                this.bridge.addChannel({channel: chan.id});
                const sessionUrl = `${channelVars.UNICASTRTP_LOCAL_ADDRESS}:${channelVars.UNICASTRTP_LOCAL_PORT}`
                const sessionData: channelData = {
                    channelId: this.channel.id,
                    callerId: this.channel.caller.number,
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
            // wait this.channel.answer()
            await this.channel.play({
                media: 'sound:silence/1',
                lang: 'ru'
            }, this.playback);

        } catch (err) {
            this.logger.error('Error initializing call session', err);
            await this.cleanup();
        }
    }

    async cleanup() {
        try {
            if(!this.bridge.id) {
                return
            }
            if (this.bridge && this.bridge.id) {
                try {
                    await this.bridge.destroy();
                } catch (e) {
                    this.logger.warn(`Bridge already destroyed or not found: ${this.bridge.id}`);
                }
            }

            if(!this.externalChannel.id) {
                return
            }

            if (this.externalChannel && this.externalChannel.id) {
                try {
                    await this.externalChannel.hangup();
                } catch (e) {
                    this.logger.warn(`External channel already hung up or not found: ${this.externalChannel.id}`);
                }
            }

            await this.openAiService.dataDecode(
                { type: 'call.hangup' },
                this.channel?.id,
                this.channel?.caller?.number,
                null
            );

            this.openAiService.eventEmitter.off(`audioDelta.${this.channel.id}`, this.audioDeltaHandler);

            await this.openAiService.closeConnection(this.channel.id);
            await this.streamAudioService.removeStream(this.channel.id);
            await this.rtpUdpServer.handleSessionEnd(this.channel.id);


        } catch (err) {
            this.logger.error('Error cleaning up session', err);
        }
    }

    async redirectToDialplan(params) {

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

        await this.channel.continueInDialplan(
            { context, extension, priority },
            err => this.logger.error('Call failed',err),
        );

        this.logger.log(`Channel ${this.channel.id} redirected to ${context},${extension},${priority}`);
    }


    async hangupCall() {
        if (!this.channel) {
            this.logger.warn('Cannot hangup: channel is undefined');
            return;
        }
        this.logger.log(`Channel ${this.channel.id} hangup`);
        await this.channel.hangup()
    }
}
