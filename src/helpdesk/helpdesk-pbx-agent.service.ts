import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { URL } from 'url';
import { HelpdeskPbxConnection } from './models/helpdesk-pbx-connection.model';
import { decryptSecret } from './helpdesk-crypto.util';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';

@Injectable()
export class HelpdeskPbxAgentService {
    private readonly logger = new Logger(HelpdeskPbxAgentService.name);

    constructor(
        @InjectModel(HelpdeskPbxConnection) private readonly connectionRepo: typeof HelpdeskPbxConnection,
        private readonly httpService: HttpService,
        private readonly alfawebhookService: HelpdeskAlfawebhookService,
    ) {}

    async getVpbxUser(clientId: string): Promise<Record<string, unknown>> {
        const data = await this.proxyGet(clientId, '/api/vpbx-user');
        return {
            ...data,
            blockedNote: data?.blocked === 1
                ? 'blocked=1 означает блокировку исходящих; входящие работают'
                : undefined,
        };
    }

    async listSipRegistrations(clientId: string): Promise<unknown> {
        return this.proxyGet(clientId, '/api/sip-registrations');
    }

    async promisedPayment(clientId: string, days = 2): Promise<unknown> {
        const clamped = Math.min(5, Math.max(2, days));
        return this.proxyPost(clientId, '/api/promised-payment', { days: clamped });
    }

    async hangupChannel(clientId: string, channelId: string, confirm: boolean): Promise<unknown> {
        if (!confirm) {
            throw new BadRequestException('Требуется confirm=true для завершения канала');
        }
        this.logger.log(`PBX hangup channel ${channelId} for client ${clientId}`);
        return this.proxyPost(clientId, '/api/hangup-channel', { channelId, confirm: true });
    }

    private async resolveConnection(clientId: string): Promise<HelpdeskPbxConnection> {
        const connection = await this.connectionRepo.findOne({
            where: { alfawebhookClientId: clientId },
        });
        if (!connection) {
            throw new NotFoundException(`PBX connection not configured for client ${clientId}`);
        }
        await this.validateUrl(connection.url, clientId);
        return connection;
    }

    private async validateUrl(url: string, clientId: string): Promise<void> {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new BadRequestException('Invalid PBX URL');
        }

        const allowlist = (process.env.HELPDESK_PBX_URL_ALLOWLIST || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

        if (allowlist.length && !allowlist.some((host) => parsed.hostname.endsWith(host))) {
            throw new BadRequestException('PBX URL host not in allowlist');
        }

        const client = await this.alfawebhookService.getClientById(clientId);
        if (client?.pbxUrl) {
            try {
                const expected = new URL(client.pbxUrl);
                if (expected.hostname !== parsed.hostname) {
                    throw new BadRequestException('PBX URL does not match client record');
                }
            } catch (e) {
                if (e instanceof BadRequestException) throw e;
            }
        }
    }

    private async proxyGet(clientId: string, path: string): Promise<Record<string, unknown>> {
        const connection = await this.resolveConnection(clientId);
        const apiKey = decryptSecret(connection.apiKeyEncrypted);
        const base = connection.url.replace(/\/$/, '');
        const response = await firstValueFrom(
            this.httpService.get(`${base}${path}`, {
                headers: { 'X-Api-Key': apiKey },
                timeout: 15000,
            }),
        );
        return response.data as Record<string, unknown>;
    }

    private async proxyPost(clientId: string, path: string, body: object): Promise<unknown> {
        const connection = await this.resolveConnection(clientId);
        const apiKey = decryptSecret(connection.apiKeyEncrypted);
        const base = connection.url.replace(/\/$/, '');
        const response = await firstValueFrom(
            this.httpService.post(`${base}${path}`, body, {
                headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
                timeout: 15000,
            }),
        );
        return response.data;
    }
}
