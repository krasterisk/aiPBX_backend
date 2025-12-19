import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RtpUdpServerService } from '../rtp-udp-server/rtp-udp-server.service';
import { OpenAiService } from '../open-ai/open-ai.service';
import { StreamAudioService } from '../audio/streamAudio.service';
import { AssistantsService } from '../assistants/assistants.service';
import { AriConnection } from './ari-connection';
import { PbxServersService } from "../pbx-servers/pbx-servers.service";

@Injectable()
export class AriService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(AriService.name);
    private connections: AriConnection[] = [];

    constructor(
        private readonly pbxServers: PbxServersService,
        private readonly rtpUdpServer: RtpUdpServerService,
        private readonly openAiService: OpenAiService,
        private readonly streamAudioService: StreamAudioService,
        private readonly assistantsService: AssistantsService
    ) {}

    async onModuleInit() {
        this.logger.log('Initializing ARI service...');

        const servers = await this.pbxServers.getAll();
        if (!servers || servers.length === 0) {
            this.logger.warn('No PBX servers found in database');
            return;
        }

        this.logger.log(`Found ${servers.length} PBX servers`);

        for (const server of servers) {
            try {
                this.logger.log(`Connecting to PBX server: ${server.name} (${server.ari_url})`);

                const connection = new AriConnection(
                    server,
                    this.rtpUdpServer,
                    this.openAiService,
                    this.streamAudioService,
                    this.assistantsService,
                );

                await connection.connect();
                this.connections.push(connection);

                this.logger.log(`Successfully connected to ARI server: ${server.name}`);

            } catch (err) {
                this.logger.error(
                    `Failed to connect to ARI server ${server.name}:`,
                    err instanceof Error ? err.message : String(err)
                );
            }
        }

        this.logger.log(`ARI service initialized with ${this.connections.length} connections`);
    }

    async onModuleDestroy() {
        this.logger.log('Shutting down ARI service...');

        for (const connection of this.connections) {
            try {
                await connection.disconnect();
            } catch (err) {
                this.logger.error('Error disconnecting ARI connection:', err);
            }
        }

        this.connections = [];
        this.logger.log('ARI service shutdown complete');
    }

    getConnections(): AriConnection[] {
        return this.connections;
    }

    getConnectionByServerId(serverId: string): AriConnection | undefined {
        return this.connections.find(conn => conn.getServerId() === serverId);
    }

    getActiveSessionsCount(): number {
        let total = 0;
        for (const connection of this.connections) {
            // Предполагаем, что у AriConnection есть метод getSessionsCount()
            // или мы можем получить размер Map сессий
            // total += connection.getSessionsCount();
        }
        return total;
    }
}
