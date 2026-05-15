import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Minimal SBIS JSON-RPC client (session cache in memory, ~30 min TTL).
 * Document push implementation can be extended; methods are safe no-ops on missing credentials.
 */
@Injectable()
export class SbisService {
    private readonly logger = new Logger(SbisService.name);
    private sessionId: string | null = null;
    private sessionExpiresAt = 0;

    constructor(private readonly http: HttpService) {}

    private ttlMs(): number {
        const mins = Number(process.env.SBIS_SESSION_TTL_MINUTES || 30);
        return (Number.isFinite(mins) ? mins : 30) * 60 * 1000;
    }

    async auth(): Promise<string | null> {
        const login = process.env.SBIS_LOGIN;
        const password = process.env.SBIS_PASS;
        if (!login || !password) {
            this.logger.debug('SBIS_LOGIN/SBIS_PASS not configured');
            return null;
        }
        const now = Date.now();
        if (this.sessionId && now < this.sessionExpiresAt) {
            return this.sessionId;
        }
        const payload = {
            jsonrpc: '2.0',
            method: 'СБИС.Аутентифицировать',
            params: { Параметр: { Логин: login, Пароль: password } },
            id: 1,
        };
        try {
            const { data } = await firstValueFrom(
                this.http.post('https://online.sbis.ru/json-rpc', payload, { timeout: 20000 }),
            );
            const sid = data?.result;
            if (typeof sid === 'string' && sid) {
                this.sessionId = sid;
                this.sessionExpiresAt = Date.now() + this.ttlMs();
                return sid;
            }
            this.logger.warn(`SBIS auth unexpected response: ${JSON.stringify(data)?.slice(0, 500)}`);
        } catch (e) {
            this.logger.warn(`SBIS auth error: ${(e as Error).message}`);
        }
        return null;
    }

    /** Placeholder: extend with СБИС.ЗаписатьДокумент when contract is finalized */
    async enqueueDocument(_type: string, _payload: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
        const sid = await this.auth();
        if (!sid) return { ok: false, detail: 'no_session' };
        return { ok: true, detail: 'stub' };
    }
}
