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
    private stasisBotName: string;

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

            this.stasisBotName = `${process.env.AIPBX_BOTNAME}_${this.pbxServer.id}`;

            if(!this.stasisBotName) {
                this.logger.error(`AI botName is empty!`);
                return;
            }

            await this.ari.start(this.stasisBotName);
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

                const appData = incoming?.dialplan?.app_data || '';
                const botName = appData.includes(',') ? appData.split(',')[0] : '';
                const uniqueId = appData.includes(',') ? appData.split(',')[1] : '';

                if (!uniqueId) {
                    this.logger.warn(`No uniqueId for Assistant passed in Stasis for ${incoming.id}`);
                    await incoming.hangup();
                    return;
                }

                if (!botName) {
                    this.logger.warn(`No botName for Assistant passed in Stasis for ${incoming.id}`);
                    await incoming.hangup();
                    return;
                }

                const assistant = await this.assistantsService.getByUniqueId(uniqueId);
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
                await session.initialize(assistant, botName);

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
