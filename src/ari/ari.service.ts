import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {RtpUdpServerService} from '../rtp-udp-server/rtp-udp-server.service';
import {OpenAiService} from '../open-ai/open-ai.service';
import {StreamAudioService} from '../audio/streamAudio.service';
import {AssistantsService} from '../assistants/assistants.service';
import {AriConnection} from './ari-connection';
import {PbxServersService} from "../pbx-servers/pbx-servers.service";

@Injectable()
export class AriService implements OnModuleInit {
    private readonly logger = new Logger(AriService.name);
    private connections: AriConnection[] = [];

    constructor(
        private readonly pbxServers: PbxServersService,
        private readonly rtpUdpServer: RtpUdpServerService,
        private readonly openAiService: OpenAiService,
        private readonly streamAudioService: StreamAudioService,
        private readonly assistantsService: AssistantsService
    ) {
    }

    async onModuleInit() {
        const servers = await this.pbxServers.getAll();
        if (!servers) {
            this.logger.warn('No PBX servers found in database');
            return;
        }
        for (const server of servers) {
            try {
                const connection = new AriConnection(
                    server,
                    this.rtpUdpServer,
                    this.openAiService,
                    this.streamAudioService,
                    this.assistantsService,
                );
                await connection.connect();
                this.connections.push(connection);
                this.logger.log(`Connected to ARI server ${server.name} ${server.id}`);
            } catch (err) {
                this.logger.error(
                    `Failed to connect to ARI server ${server.name}`,
                    err instanceof Error ? err.stack : String(err),
                );
            }
        }

        this.logger.log(`Initialized ${this.connections.length} ARI connections`);
    }
}
