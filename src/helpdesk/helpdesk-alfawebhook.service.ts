import { Injectable } from '@nestjs/common';
import { AlfawebhookClient } from '../accounting/alfawebhook-client.service';
import {
    AlfawebhookClientDto,
    HelpdeskIdentifyResultDto,
} from './dto/alfawebhook-client.dto';

export interface HelpdeskIdentifyParams {
    phone?: string;
    inn?: string;
    name?: string;
}

@Injectable()
export class HelpdeskAlfawebhookService {
    constructor(private readonly alfawebhookClient: AlfawebhookClient) {}

    private mapClient(record: {
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
    }): AlfawebhookClientDto {
        return {
            id: record.id,
            inn: record.inn,
            kpp: record.kpp,
            name: record.name,
            pbxUrl: record.pbxUrl,
            balance: record.balance,
            licNum: record.licNum,
            email: record.email,
            phone: record.phone,
            organizationId: record.organizationId,
        };
    }

    /**
     * Идентификация клиента: сначала по телефону (D-01), затем ИНН/название.
     */
    async identifyClient(params: HelpdeskIdentifyParams): Promise<HelpdeskIdentifyResultDto> {
        const phone = params.phone?.trim();
        const inn = params.inn?.trim();
        const name = params.name?.trim();

        if (phone) {
            const byPhone = await this.alfawebhookClient.searchClients({ phone });
            if (byPhone.length === 1) {
                const client = this.mapClient(byPhone[0]);
                return {
                    found: true,
                    client,
                    isCloud: !!client.pbxUrl,
                    message: 'Клиент найден по номеру телефона',
                };
            }
            if (byPhone.length > 1) {
                return {
                    found: false,
                    candidates: byPhone.slice(0, 3).map((c) => this.mapClient(c)),
                    message: 'Найдено несколько клиентов по телефону — уточните ИНН или полное название',
                };
            }
        }

        if (inn) {
            const byInn = await this.alfawebhookClient.searchClients({ inn });
            if (byInn.length === 1) {
                const client = this.mapClient(byInn[0]);
                return {
                    found: true,
                    client,
                    isCloud: !!client.pbxUrl,
                    message: 'Клиент найден по ИНН',
                };
            }
            if (byInn.length > 1) {
                return {
                    found: false,
                    candidates: byInn.slice(0, 3).map((c) => this.mapClient(c)),
                    message: 'Найдено несколько записей по ИНН',
                };
            }
        }

        if (name) {
            const byName = await this.alfawebhookClient.searchClients({ name });
            if (byName.length === 1) {
                const client = this.mapClient(byName[0]);
                return {
                    found: true,
                    client,
                    isCloud: !!client.pbxUrl,
                    message: 'Клиент найден по названию',
                };
            }
            if (byName.length > 1) {
                return {
                    found: false,
                    candidates: byName.slice(0, 3).map((c) => this.mapClient(c)),
                    message: 'Найдено несколько организаций — подтвердите по ИНН или полному юридическому названию',
                };
            }
        }

        return {
            found: false,
            message: 'Клиент не найден в базе alfawebhook',
        };
    }

    async getClientByInn(inn: string): Promise<AlfawebhookClientDto | null> {
        const rows = await this.alfawebhookClient.searchClients({ inn });
        return rows[0] ? this.mapClient(rows[0]) : null;
    }

    async getClientById(clientId: string): Promise<AlfawebhookClientDto | null> {
        const rows = await this.alfawebhookClient.searchClients({ id: clientId });
        return rows[0] ? this.mapClient(rows[0]) : null;
    }
}
