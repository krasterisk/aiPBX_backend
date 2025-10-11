import { Logger } from '@nestjs/common';
import * as ariClient from 'ari-client';
import { RtpUdpServerService } from '../rtp-udp-server/rtp-udp-server.service';
import { OpenAiService } from '../open-ai/open-ai.service';
import { StreamAudioService } from '../audio/streamAudio.service';
import { AssistantsService } from '../assistants/assistants.service';
import { CallSession } from './call-sessions';
import { PbxServers } from '../pbx-servers/pbx-servers.model';

export class AriConnection {
    private readonly logger = new Logger(AriConnection.name);
    private sessions = new Map<string, CallSession>();
    private ari: ariClient.Client;

    constructor(
        private readonly pbxServer: PbxServers,
        private readonly rtpUdpServer: RtpUdpServerService,
        private readonly openAiService: OpenAiService,
        private readonly streamAudioService: StreamAudioService,
        private readonly assistantsService: AssistantsService,
    ) {}

    async connect() {
        try {
            this.ari = await ariClient.connect(
                this.pbxServer.ari_url,
                this.pbxServer.ari_user,
                this.pbxServer.password,
            );
            await this.ari.start('voiceBotApp');
            this.logger.log(`Connected to ARI server: ${this.pbxServer.name} (${this.pbxServer.location})`);

            this.registerEventHandlers();
        } catch (err) {
            this.logger.error(`Error connecting to ${this.pbxServer.ari_url}`, err);
        }
    }

    private registerEventHandlers() {
        (this.ari as any).on('StasisStart', async (event: any, incoming: ariClient.Channel, args: any) => {
            if (this.sessions.has(incoming.id)) return;

            if (incoming.name.startsWith('UnicastRTP/')) return;

            try {
                const extension = incoming?.dialplan?.app_data || '';
                if (!extension) {
                    this.logger.warn(`No extension passed in Stasis for ${incoming.id}`);
                    await incoming.hangup();
                    return;
                }

                // todo Здесь нужно сделать парсинг id ассистента по аргументу app_data
                const lastDigit = Number(extension.slice(-1));
                const assistant = await this.assistantsService.getById(lastDigit);
                if (!assistant) {
                    this.logger.warn(`Assistant is empty!`);
                    await incoming.hangup();
                    return;
                }

                const externalHost = process.env.EXTERNAL_HOST;

                if(!externalHost) {
                    this.logger.warn(`External host is empty!`);
                    await incoming.hangup();
                    return;
                }

                const session = new CallSession(
                    this.ari,
                    incoming,
                    externalHost,
                    this.rtpUdpServer,
                    this.openAiService,
                    this.streamAudioService,
                    assistant,
                );

                this.sessions.set(incoming.id, session);
                await session.initialize(assistant);

                incoming.on('StasisEnd', async () => this.cleanupSession(incoming.id));

            } catch (err) {
                this.logger.error('Error handling new call', err);
            }
        });

        this.ari.on('StasisEnd', async (event, channel) => {
            await this.cleanupSession(channel.id);
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
            this.logger.error(`Error cleaning up session for ${channelId}`, err);
        }
    }
}
