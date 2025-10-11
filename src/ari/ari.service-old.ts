import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import * as ariClient from 'ari-client';
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";
import {OpenAiService} from "../open-ai/open-ai.service";
import {StreamAudioService} from "../audio/streamAudio.service";
import {AssistantsService} from "../assistants/assistants.service";
import {CallSession} from "./call-sessions";

@Injectable()
export class AriService implements OnModuleInit {
    private readonly url = process.env.ARI_URL;
    private readonly username = process.env.ARI_USER;
    private readonly password = process.env.ARI_PASS;
    private readonly externalHost = process.env.ARI_EXTERNAL_HOST;
    private readonly logger = new Logger(AriService.name);

    private sessions = new Map<string, CallSession>();
    private ari: ariClient.Client;

    constructor(
        @Inject(RtpUdpServerService) private readonly rtpUdpServer: RtpUdpServerService,
        @Inject(OpenAiService) private readonly openAiService: OpenAiService,
        @Inject(StreamAudioService) private readonly streamAudioService: StreamAudioService,
        @Inject(AssistantsService) private readonly assistantsService: AssistantsService
    ) {}


    async onModuleInit() {
        // const bots: Assistant[] = await this.assistantsService.getAll('0', true)
        // if (!bots) {
        //     this.logger.error('Error getting bots list');
        //     return
        // }
        // for (const assistant of bots) {
        //     await this.connectToARI(assistant);
        // }
        try {
            this.ari = await ariClient.connect(this.url, this.username, this.password);
            await this.ari.start('voiceBotApp');

            this.logger.log('Connected to ARI and started app: voiceBotApp');

            this.registerEventHandlers();
        } catch (err) {
            this.logger.error('Error connecting to ARI', err);
        }

    }

    private registerEventHandlers() {
        (this.ari as any).on('StasisStart', async (event: any, incoming: ariClient.Channel, args: any) => {
            if (this.sessions.has(incoming.id)) {
                this.logger.warn(`Session already exists for channel ${incoming.id}`);
                return;
            }

            if (incoming.name.startsWith('UnicastRTP/')) {
                this.logger.log(`Ignoring external media channel: ${incoming.id}`);
                return;
            }

            try {
                // ⚡ Extension передаётся в Stasis() как аргумент
                //const extension = args?.[0];
                const extension = incoming?.dialplan?.app_data || '';

                if (!extension) {
                    this.logger.error(`No extension passed in Stasis for channel ${incoming.id}`);
                    await incoming.hangup();
                    return;
                }

                // todo Здесь нужно сделать парсинг id ассистента по аргументу app_data
                const lastDigit = Number(extension.slice(-1));

                this.logger.log(`Incoming call to extension ${extension}, last digit: ${lastDigit}`);

                // Находим ассистента по extension или последней цифре
                const assistant = await this.assistantsService.getById(lastDigit);

                if (!assistant) {
                    this.logger.error(`Assistant not found for extension ${extension}, hanging up`);
                    await incoming.hangup();
                    return;
                }
                const session = new CallSession(
                    this.ari,
                    incoming,
                    this.externalHost,
                    this.rtpUdpServer,
                    this.openAiService,
                    this.streamAudioService,
                    assistant
                );

                this.sessions.set(incoming.id, session);

                // const botName = 'voiceBot_' + String(assistant.id);
                await session.initialize(assistant);

                incoming.on('StasisEnd', async () => {
                    try {
                        await this.cleanupSession(incoming.id);
                    } catch (e) {
                        this.logger.warn(`Cant cleanup session ${incoming.id}` + e)
                    }

                });

            } catch (err) {
                this.logger.error('Error handling new call', err);
            }
        });

        this.ari.on('StasisEnd', async (event, channel) => {
            try {
                await this.cleanupSession(channel.id);
            } catch (e) {
                this.logger.warn(`Cant cleanup session ${channel.id}` + e)
            }
        });

        this.ari.on('ChannelDialplan', (event, channel) => {
            this.logger.debug(`ChannelDialplan event: ${JSON.stringify(event)}`);
        });
    }


    private async cleanupSession(channelId: string) {
        try {
            const session = this.sessions.get(channelId);
            if (session) {
                await session.cleanup();
                this.sessions.delete(channelId);
                this.logger.log(`Session for channel ${channelId} cleaned up`);
            }
        } catch (err) {
            this.logger.error(`Error cleaning up session for channel ${channelId}`, err);
        }
    }

}
