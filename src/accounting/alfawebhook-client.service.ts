import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Organization } from '../organizations/organizations.model';

export interface AlfawebhookClientSearchParams {
    phone?: string;
    inn?: string;
    name?: string;
}

export interface AlfawebhookClientRecord {
    id?: string;
    inn?: string;
    kpp?: string;
    name?: string;
    pbxUrl?: string;
    balance?: number;
    licNum?: string;
    email?: string;
    phone?: string;
    organizationId?: string;
}

@Injectable()
export class AlfawebhookClient {
    private readonly logger = new Logger(AlfawebhookClient.name);

    constructor(private readonly http: HttpService) {}

    private baseUrl(): string | null {
        const u = (process.env.ALFAWEBHOOK_BASE_URL || process.env.ALFA_BASE || '').trim();
        return u || null;
    }

    /**
     * Registers / updates client in alfawebhook (best-effort; alfawebhook accepts extended body).
     */
    async ensureClientRegistered(org: Organization, licNum: string, subject: string): Promise<void> {
        const base = this.baseUrl();
        if (!base) {
            this.logger.debug('ALFAWEBHOOK_BASE_URL not set — skip client registration');
            return;
        }
        const url = `${base.replace(/\/$/, '')}/api/clients`;
        const organizationId = (process.env.ALFA_OUR_ORG_ID || '').trim() || 'aipbx';
        const pbxUrl = (process.env.ALFA_PBX_CALLBACK_URL || process.env.PBX_PUBLIC_URL || '').trim();

        const body = {
            inn: org.tin,
            name: org.name,
            organizationId,
            transactionId: `org-${org.id}`,
            kpp: org.kpp || undefined,
            ogrn: org.ogrn || undefined,
            legalForm: org.legalForm || undefined,
            director: org.director || undefined,
            email: org.email || undefined,
            phone: org.phone || undefined,
            bankAccount: org.bankAccount || undefined,
            bankBic: org.bankBic || undefined,
            bankName: org.bankName || undefined,
            subject,
            licNum,
            pbxUrl: pbxUrl || undefined,
            address: org.address,
        };

        await firstValueFrom(
            this.http.post(url, body, {
                timeout: 15000,
                validateStatus: () => true,
            }),
        ).then((res) => {
            if (res.status >= 400) {
                this.logger.warn(`alfawebhook POST /api/clients returned ${res.status}`);
            }
        });
    }

    /**
     * Поиск клиентов в alfawebhook (GET /api/clients).
     */
    async searchClients(params: AlfawebhookClientSearchParams): Promise<AlfawebhookClientRecord[]> {
        const base = this.baseUrl();
        if (!base) {
            this.logger.debug('ALFAWEBHOOK_BASE_URL not set — skip client search');
            return [];
        }

        const query = new URLSearchParams();
        if (params.phone?.trim()) query.set('phone', params.phone.trim());
        if (params.inn?.trim()) query.set('inn', params.inn.trim().replace(/\D/g, ''));
        if (params.name?.trim()) query.set('name', params.name.trim());

        if ([...query.keys()].length === 0) {
            return [];
        }

        const url = `${base.replace(/\/$/, '')}/api/clients?${query.toString()}`;

        try {
            const res = await firstValueFrom(
                this.http.get(url, {
                    timeout: 15000,
                    validateStatus: () => true,
                }),
            );

            if (res.status >= 400) {
                this.logger.warn(`alfawebhook GET /api/clients returned ${res.status}`);
                return [];
            }

            const data = res.data;
            if (Array.isArray(data)) {
                return data as AlfawebhookClientRecord[];
            }
            if (data && Array.isArray(data.items)) {
                return data.items as AlfawebhookClientRecord[];
            }
            if (data && typeof data === 'object') {
                return [data as AlfawebhookClientRecord];
            }
            return [];
        } catch (err) {
            this.logger.warn(`alfawebhook GET /api/clients failed: ${(err as Error).message}`);
            return [];
        }
    }
}
