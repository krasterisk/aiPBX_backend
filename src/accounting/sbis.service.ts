import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/sequelize';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { EgrulCache } from './egrul-cache.model';
import type {
    CounterpartyLookupApiResult,
    CounterpartyLookupResult,
    OrganizationLegalForm,
    SbisInvoiceDraftInput,
    SbisInvoiceDraftResult,
} from './sbis.types';

const AUTH_URL = 'https://online.sbis.ru/auth/service/';
const RPC_URL = 'https://online.sbis.ru/service/?srv=1';
const JSON_RPC_HEADERS = {
    'Content-Type': 'application/json-rpc;charset=utf-8',
};
const SBIS_LOG_BODY_MAX = 4000;

export interface SbisRpcErrorDetail {
    method: string;
    httpStatus?: number;
    code?: string | number;
    message: string;
    details?: string;
    raw?: unknown;
}

type SbisRpcCallOk<T> = { ok: true; result: T };
type SbisRpcCallFail = { ok: false; error: SbisRpcErrorDetail };
type SbisRpcCallResult<T> = SbisRpcCallOk<T> | SbisRpcCallFail;

@Injectable()
export class SbisService {
    private readonly logger = new Logger(SbisService.name);
    private sessionId: string | null = null;
    private sessionExpiresAt = 0;

    constructor(
        private readonly http: HttpService,
        @InjectModel(EgrulCache) private readonly egrulCacheModel: typeof EgrulCache,
    ) {}

    isConfigured(): boolean {
        return !!(process.env.SBIS_LOGIN && process.env.SBIS_PASS);
    }

    resolveInvoiceSource(): 'saby' | 'local' {
        const explicit = (process.env.SBIS_INVOICE_SOURCE || '').trim().toLowerCase();
        if (explicit === 'local') return 'local';
        if (explicit === 'saby') return 'saby';
        return this.isConfigured() ? 'saby' : 'local';
    }

    private ttlMs(): number {
        const mins = Number(process.env.SBIS_SESSION_TTL_MINUTES || 30);
        return (Number.isFinite(mins) ? mins : 30) * 60 * 1000;
    }

    private cacheTtlDays(): number {
        const days = Number(process.env.EGRUL_CACHE_TTL_DAYS || 30);
        return Number.isFinite(days) && days > 0 ? days : 30;
    }

    private legalFormFromInn(inn: string): OrganizationLegalForm {
        return inn.replace(/\D/g, '').length === 12 ? 'ip' : 'ul';
    }

    private sbisDebugEnabled(): boolean {
        return (process.env.SBIS_DEBUG_LOG || '').trim().toLowerCase() === 'true';
    }

    private truncateJson(value: unknown, max = SBIS_LOG_BODY_MAX): string {
        try {
            const s = JSON.stringify(value);
            return s.length <= max ? s : `${s.slice(0, max)}…`;
        } catch {
            return String(value).slice(0, max);
        }
    }

    private parseJsonRpcError(method: string, httpStatus: number, data: unknown): SbisRpcErrorDetail {
        const err =
            data && typeof data === 'object' && 'error' in data
                ? (data as { error?: Record<string, unknown> }).error
                : undefined;
        const message =
            (typeof err?.message === 'string' && err.message) ||
            (typeof err?.details === 'string' && err.details) ||
            this.truncateJson(data, 800);
        return {
            method,
            httpStatus,
            code: err?.code as string | number | undefined,
            message,
            details: typeof err?.details === 'string' ? err.details : undefined,
            raw: err ?? data,
        };
    }

    private logSbisRpcFailure(detail: SbisRpcErrorDetail, params: unknown): void {
        this.logger.warn(
            `SBIS RPC ${detail.method} failed: HTTP ${detail.httpStatus ?? '?'}, ` +
                `code=${detail.code ?? 'n/a'}, message=${detail.message}` +
                (detail.details ? `, details=${detail.details}` : ''),
        );
        this.logger.warn(
            `SBIS RPC ${detail.method} params=${this.truncateJson(params, 600)} ` +
                `errorBody=${this.truncateJson(detail.raw)}`,
        );
    }

    private logSbisRpcSuccess(method: string, params: unknown, result: unknown): void {
        if (!this.sbisDebugEnabled()) return;
        this.logger.debug(
            `SBIS RPC ${method} OK: params=${this.truncateJson(params, 400)} ` +
                `result=${this.truncateJson(result)}`,
        );
    }

    async auth(force = false): Promise<string | null> {
        const login = process.env.SBIS_LOGIN;
        const password = process.env.SBIS_PASS;
        if (!login || !password) {
            this.logger.debug('SBIS_LOGIN/SBIS_PASS not configured');
            return null;
        }
        const now = Date.now();
        if (!force && this.sessionId && now < this.sessionExpiresAt) {
            return this.sessionId;
        }
        const param: Record<string, string> = {
            Логин: login,
            Пароль: password,
        };
        const acc = (process.env.SBIS_ACC || '').trim();
        if (acc) {
            param.НомерАккаунта = acc;
        }
        const payload = {
            jsonrpc: '2.0',
            method: 'СБИС.Аутентифицировать',
            params: { Параметр: param },
            id: 0,
        };
        try {
            const { data } = await firstValueFrom(
                this.http.post(AUTH_URL, payload, {
                    headers: JSON_RPC_HEADERS,
                    timeout: 20000,
                }),
            );
            const sid = data?.result;
            if (typeof sid === 'string' && sid) {
                this.sessionId = sid;
                this.sessionExpiresAt = Date.now() + this.ttlMs();
                return sid;
            }
            this.logger.warn(`SBIS auth unexpected response: ${this.truncateJson(data)}`);
        } catch (e) {
            const ax = e as AxiosError;
            this.logger.warn(
                `SBIS auth error: ${(e as Error).message}` +
                    (ax.response?.data ? ` body=${this.truncateJson(ax.response.data)}` : ''),
            );
        }
        return null;
    }

    private async executeRpc<T>(
        method: string,
        params: unknown,
        retried = false,
        rpcUrl: string = RPC_URL,
        extraBody: Record<string, unknown> = {},
        quiet = false,
    ): Promise<SbisRpcCallResult<T>> {
        const sid = await this.auth();
        if (!sid) {
            return {
                ok: false as const,
                error: {
                    method,
                    message: 'SBIS is not configured (no session)',
                },
            };
        }
        const body = {
            jsonrpc: '2.0',
            method,
            params,
            protocol: 4,
            id: Date.now(),
            ...extraBody,
        };
        try {
            const { data, status } = await firstValueFrom(
                this.http.post(rpcUrl, body, {
                    headers: {
                        ...JSON_RPC_HEADERS,
                        'X-SBISSessionID': sid,
                    },
                    timeout: 30000,
                    validateStatus: () => true,
                }),
            );
            if (status === 401 && !retried) {
                this.sessionId = null;
                this.sessionExpiresAt = 0;
                return this.executeRpc<T>(method, params, true, rpcUrl, extraBody, quiet);
            }
            if (status >= 400) {
                const detail = this.parseJsonRpcError(method, status, data);
                detail.message = `HTTP ${status}: ${detail.message}`;
                if (!quiet) {
                    this.logSbisRpcFailure(detail, params);
                }
                return { ok: false as const, error: detail };
            }
            if (data?.error) {
                const detail = this.parseJsonRpcError(method, status, data);
                if (!quiet) {
                    this.logSbisRpcFailure(detail, params);
                }
                return { ok: false as const, error: detail };
            }
            const result = data?.result as T;
            this.logSbisRpcSuccess(method, params, result);
            return { ok: true as const, result };
        } catch (e) {
            const ax = e as AxiosError;
            if (ax.response?.status === 401 && !retried) {
                this.sessionId = null;
                this.sessionExpiresAt = 0;
                return this.executeRpc<T>(method, params, true, rpcUrl, extraBody, quiet);
            }
            const detail: SbisRpcErrorDetail = {
                method,
                httpStatus: ax.response?.status,
                message: (e as Error).message,
                raw: ax.response?.data,
            };
            if (!quiet) {
                this.logSbisRpcFailure(detail, params);
            }
            return { ok: false as const, error: detail };
        }
    }

    private async callRpc<T>(method: string, params: unknown, retried = false): Promise<T> {
        const outcome = await this.executeRpc<T>(method, params, retried);
        if (outcome.ok === false) {
            const { error } = outcome;
            throw new HttpException(
                {
                    message: `SBIS RPC ${method}: ${error.message}`,
                    sbis: error,
                },
                HttpStatus.BAD_GATEWAY,
            );
        }
        return outcome.result;
    }

    private pickString(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
        if (!obj) return null;
        for (const key of keys) {
            const v = obj[key];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return null;
    }

    /** СБИС.ИнформацияОКонтрагенте — поле Участник (не Контрагент). */
    private buildCounterpartyInfoRpcParams(
        inn: string,
        kpp: string | null,
    ): Record<string, unknown> {
        const participant =
            inn.length === 12
                ? { СвФЛ: { ИНН: inn } }
                : {
                      СвЮЛ: {
                          ИНН: inn,
                          ...(kpp ? { КПП: kpp } : {}),
                      },
                  };
        return { Участник: participant };
    }

    /** ЮЛ (10 цифр): СБИС.ИнформацияОКонтрагенте требует КПП. */
    private isLegalEntityInn(inn: string): boolean {
        return inn.length === 10;
    }

    /** KPP is 9 digits and must not be the first 9 digits of INN (common mistype while typing). */
    private sanitizeKpp(kppRaw: string | null | undefined, inn: string): string | null {
        const kpp = kppRaw?.replace(/\D/g, '') || '';
        if (kpp.length !== 9) {
            return null;
        }
        if (this.isLegalEntityInn(inn) && inn.startsWith(kpp)) {
            return null;
        }
        return kpp;
    }

    private extractKppFromSbisObject(obj: Record<string, unknown> | null | undefined): string | null {
        if (!obj) {
            return null;
        }
        const svUl = (obj.СвЮЛ ?? obj) as Record<string, unknown>;
        return this.pickString(svUl, 'КПП', 'KPP') || this.pickString(obj, 'КПП', 'KPP');
    }

    private isSbisRequisitesClientError(errors: SbisRpcErrorDetail[]): boolean {
        const text = errors
            .map((e) => `${e.message || ''} ${e.details || ''}`)
            .join(' ')
            .toLowerCase();
        return (
            text.includes('кпп') ||
            text.includes('реквизит') ||
            text.includes('нет поля кпп') ||
            text.includes('нет поля d') ||
            text.includes('byinnkppkf') ||
            text.includes('не передан аргумент')
        );
    }

    /** Варианты params для Контрагент.ПоИННКППКФ. */
    private buildFindByInnRpcParamVariants(inn: string, kpp: string | null): Record<string, unknown>[] {
        if (kpp) {
            return [{ params: { ИНН: inn, КПП: kpp } }];
        }
        const svUl = { ИНН: inn };
        return [
            { params: { ИНН: inn } },
            { params: { СвЮЛ: svUl } },
            { params: { Контрагент: { СвЮЛ: svUl } } },
        ];
    }

    private buildFindByInnRpcParams(inn: string, kpp: string | null): Record<string, unknown> {
        return this.buildFindByInnRpcParamVariants(inn, kpp)[0];
    }

    private async executeFindByInnRpc(
        inn: string,
        kpp: string | null,
    ): Promise<
        | { ok: true; result: Record<string, unknown> }
        | { ok: false; errors: SbisRpcErrorDetail[]; requiresKpp: boolean }
    > {
        const variants = this.buildFindByInnRpcParamVariants(inn, kpp);
        const errors: SbisRpcErrorDetail[] = [];

        for (let i = 0; i < variants.length; i++) {
            const call = await this.executeRpc<Record<string, unknown>>(
                'Контрагент.ПоИННКППКФ',
                variants[i],
                false,
                RPC_URL,
                {},
                i < variants.length - 1,
            );
            if (call.ok === true) {
                if (i > 0) {
                    this.logger.log(
                        `Контрагент.ПоИННКППКФ: variant #${i + 1} succeeded for inn=${inn}`,
                    );
                }
                return { ok: true, result: call.result };
            }
            errors.push(call.error);
            if (!this.isSbisRequisitesClientError([call.error])) {
                break;
            }
        }

        if (errors.length > 0) {
            this.logger.warn(
                `Контрагент.ПоИННКППКФ failed for inn=${inn}${kpp ? ` kpp=${kpp}` : ''} ` +
                    `after ${errors.length} variant(s): ${errors[errors.length - 1].details || errors[errors.length - 1].message}`,
            );
        }

        return {
            ok: false,
            errors,
            requiresKpp: errors.length > 0 && this.isSbisRequisitesClientError(errors),
        };
    }

    private mapCounterpartyFromSbis(raw: unknown, inn: string, kpp?: string | null): CounterpartyLookupResult {
        const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const counterparty = (root.Участник ?? root.Контрагент ?? root) as Record<string, unknown>;
        const svUl = (counterparty.СвЮЛ ?? counterparty) as Record<string, unknown>;
        const svFl = counterparty.СвФЛ as Record<string, unknown> | undefined;
        const isIp = inn.replace(/\D/g, '').length === 12 || !!svFl;

        const kppFromSbis = this.sanitizeKpp(this.extractKppFromSbisObject(counterparty), inn);
        const kppFromRequest = this.sanitizeKpp(kpp ?? null, inn);

        const name =
            this.pickString(svUl, 'Название', 'НаимОрг', 'ShortName', 'НазваниеПолное') ||
            this.pickString(svFl, 'Фамилия', 'Имя') ||
            this.pickString(counterparty, 'Название', 'Name') ||
            '';

        const directorParts = [
            this.pickString(svUl, 'Фамилия', 'Имя', 'Отчество'),
            this.pickString(counterparty, 'Руководитель', 'DirectorName'),
        ].filter(Boolean);
        const directorFromArray = Array.isArray(counterparty.DirectorName)
            ? (counterparty.DirectorName as string[]).join(' ')
            : null;

        return {
            inn,
            kpp: kppFromSbis || kppFromRequest,
            name,
            fullName: this.pickString(svUl, 'НазваниеПолное', 'FullName', 'Название') || name,
            address:
                this.pickString(svUl, 'АдресЮридический', 'Адрес', 'Address', 'AddressEGRUL') ||
                this.pickString(counterparty, 'АдресЮридический', 'Адрес'),
            ogrn: this.pickString(svUl, 'ОГРН', 'OGRN'),
            director: directorFromArray || directorParts.join(' ').trim() || null,
            directorPosition: this.pickString(svUl, 'Должность', 'DirectorPosition'),
            okpo: this.pickString(svUl, 'ОКПО', 'OKPO'),
            legalForm: isIp ? 'ip' : 'ul',
            sbisCounterpartyId:
                this.pickString(counterparty, '@Лицо', 'Идентификатор', 'id') ||
                (counterparty['@Лицо'] != null ? String(counterparty['@Лицо']) : null),
            fromCache: false,
        };
    }

    private extractFindCandidates(raw: unknown, inn: string): CounterpartyLookupResult[] {
        if (raw == null) {
            return [];
        }

        const items: unknown[] = [];
        if (Array.isArray(raw)) {
            items.push(...raw);
        } else if (typeof raw === 'object') {
            const obj = raw as Record<string, unknown>;
            const listKeys = ['Контрагенты', 'Список', 'СписокКонтрагентов', 'items', 'data'];
            let fromList = false;
            for (const key of listKeys) {
                if (Array.isArray(obj[key])) {
                    items.push(...(obj[key] as unknown[]));
                    fromList = true;
                    break;
                }
            }
            if (!fromList) {
                const ctr = obj.Контрагент;
                if (Array.isArray(ctr)) {
                    items.push(...ctr);
                } else if (ctr && typeof ctr === 'object') {
                    items.push(ctr);
                } else {
                    items.push(obj);
                }
            }
        }

        const seen = new Set<string>();
        const out: CounterpartyLookupResult[] = [];
        for (const item of items) {
            const mapped = this.mapCounterpartyFromSbis(item, inn);
            if (!mapped.name?.trim()) {
                continue;
            }
            const key = `${mapped.kpp || ''}|${mapped.name}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            out.push(mapped);
        }
        return out;
    }

    private async cacheCounterpartyResult(merged: CounterpartyLookupResult): Promise<void> {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.cacheTtlDays());
        await this.egrulCacheModel.upsert({
            inn: merged.inn,
            kpp: merged.kpp,
            payload: merged as unknown as Record<string, unknown>,
            source: 'saby_edo',
            fetchedAt: new Date(),
            expiresAt,
        });
    }

    private async lookupCounterpartyFull(
        inn: string,
        kpp: string | null,
    ): Promise<CounterpartyLookupResult> {
        const sbisFailures: SbisRpcErrorDetail[] = [];

        let findResult: Record<string, unknown> | null = null;
        const findOutcome = await this.executeFindByInnRpc(inn, kpp);
        if (findOutcome.ok === true) {
            findResult = findOutcome.result;
        } else {
            sbisFailures.push(...findOutcome.errors);
        }

        let infoResult: unknown = null;
        const infoCall = await this.executeRpc<unknown>(
            'СБИС.ИнформацияОКонтрагенте',
            this.buildCounterpartyInfoRpcParams(inn, kpp),
        );
        if (infoCall.ok === true) {
            infoResult = infoCall.result;
        } else {
            sbisFailures.push(infoCall.error);
        }

        const merged = this.mapCounterpartyFromSbis(
            infoResult ?? findResult ?? {},
            inn,
            kpp,
        );

        if (!merged.name && findResult) {
            const fromFind = this.mapCounterpartyFromSbis(findResult, inn, kpp);
            merged.name = fromFind.name || merged.name;
            merged.address = merged.address || fromFind.address;
            merged.kpp = fromFind.kpp || merged.kpp;
            merged.sbisCounterpartyId = merged.sbisCounterpartyId || fromFind.sbisCounterpartyId;
        }

        if (merged.name && this.isLegalEntityInn(inn) && !merged.kpp) {
            throw new HttpException(
                {
                    message: 'Valid KPP is required for legal entities',
                    inn,
                    kpp,
                    hint: 'Provide 9-digit KPP that is not a prefix of the INN',
                },
                HttpStatus.BAD_REQUEST,
            );
        }

        if (!merged.name) {
            this.logger.warn(
                `lookupCounterpartyFull(${inn}${kpp ? ` kpp=${kpp}` : ''}): empty name. ` +
                    `findOk=${findOutcome.ok === true} infoOk=${infoCall.ok === true} ` +
                    `findPreview=${this.truncateJson(findResult, 800)} ` +
                    `infoPreview=${this.truncateJson(infoResult, 800)}`,
            );

            if (sbisFailures.length > 0) {
                const status = this.isSbisRequisitesClientError(sbisFailures)
                    ? HttpStatus.BAD_REQUEST
                    : HttpStatus.BAD_GATEWAY;
                throw new HttpException(
                    {
                        message:
                            status === HttpStatus.BAD_REQUEST
                                ? 'Invalid counterparty requisites for SBIS lookup'
                                : 'SBIS counterparty lookup failed',
                        inn,
                        kpp,
                        sbisErrors: sbisFailures,
                    },
                    status,
                );
            }

            throw new HttpException(
                {
                    message: 'Counterparty not found in SBIS',
                    inn,
                    kpp,
                },
                HttpStatus.NOT_FOUND,
            );
        }

        merged.legalForm = merged.legalForm || this.legalFormFromInn(inn);
        merged.fromCache = false;
        await this.cacheCounterpartyResult(merged);
        return merged;
    }

    private async lookupCounterpartyByInnOnly(inn: string): Promise<CounterpartyLookupApiResult> {
        const findOutcome = await this.executeFindByInnRpc(inn, null);

        if (findOutcome.ok !== true) {
            if (findOutcome.requiresKpp) {
                return { status: 'requires_kpp', inn };
            }
            throw new HttpException(
                {
                    message: 'SBIS counterparty lookup failed',
                    inn,
                    sbisErrors: findOutcome.errors,
                },
                HttpStatus.BAD_GATEWAY,
            );
        }

        const candidates = this.extractFindCandidates(findOutcome.result, inn);
        if (candidates.length === 0) {
            return { status: 'requires_kpp', inn };
        }
        if (candidates.length === 1) {
            const candidate = candidates[0];
            if (candidate.kpp) {
                try {
                    const full = await this.lookupCounterpartyFull(inn, candidate.kpp);
                    return { status: 'single', data: full };
                } catch (err) {
                    if (err instanceof HttpException && err.getStatus() === HttpStatus.BAD_REQUEST) {
                        return { status: 'requires_kpp', inn };
                    }
                    throw err;
                }
            }
            return { status: 'requires_kpp', inn };
        }

        return { status: 'choose', inn, candidates };
    }

    async lookupCounterparty(innRaw: string, kppRaw?: string | null): Promise<CounterpartyLookupApiResult> {
        const inn = innRaw.replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) {
            throw new HttpException('Invalid INN length', HttpStatus.BAD_REQUEST);
        }
        const kppInput = kppRaw?.replace(/\D/g, '') || null;
        const kpp = this.sanitizeKpp(kppInput, inn);

        const cached = await this.egrulCacheModel.findByPk(inn);
        if (cached && new Date(cached.expiresAt) > new Date()) {
            const payload = cached.payload as unknown as CounterpartyLookupResult;
            const cachedKpp = this.sanitizeKpp(payload.kpp, inn);
            if (payload.name && cachedKpp && (!kpp || cachedKpp === kpp)) {
                return { status: 'single', data: { ...payload, kpp: cachedKpp, fromCache: true } };
            }
        }

        if (!this.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        if (this.isLegalEntityInn(inn) && kppInput && !kpp) {
            return { status: 'requires_kpp', inn };
        }

        if (this.isLegalEntityInn(inn) && !kpp) {
            return this.lookupCounterpartyByInnOnly(inn);
        }

        const data = await this.lookupCounterpartyFull(inn, kpp);
        return { status: 'single', data };
    }

    private buildOurOrgBlock(innOverride?: string | null, kppOverride?: string | null): Record<string, unknown> {
        const inn = (innOverride || process.env.SBIS_OUR_INN || '').trim();
        const kpp = (kppOverride || process.env.SBIS_OUR_KPP || '').trim();
        if (inn.length === 12) {
            return { СвФЛ: { ИНН: inn } };
        }
        return {
            СвЮЛ: {
                ИНН: inn,
                ...(kpp ? { КПП: kpp } : {}),
            },
        };
    }

    /** SBIS document date fields expect DD.MM.YYYY, not ISO YYYY-MM-DD. */
    private formatDateForSbis(isoOrRu: string): string {
        const s = isoOrRu.trim();
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
            return s;
        }
        const p = s.split('-');
        if (p.length === 3 && p[0].length === 4) {
            return `${p[2]}.${p[1]}.${p[0]}`;
        }
        return s;
    }

    private buildCounterpartyBlock(input: SbisInvoiceDraftInput): Record<string, unknown> {
        const inn = input.counterpartyInn.replace(/\D/g, '');
        const kpp = input.counterpartyKpp?.replace(/\D/g, '') || '';
        const name = (input.counterpartyName || '').trim();
        if (input.legalForm === 'ip' || inn.length === 12) {
            return {
                СвФЛ: {
                    ИНН: inn,
                    ...(name ? { Фамилия: name } : {}),
                },
            };
        }
        return {
            СвЮЛ: {
                ИНН: inn,
                ...(kpp ? { КПП: kpp } : {}),
                ...(name ? { Название: name } : {}),
            },
        };
    }

    async createInvoiceDraft(input: SbisInvoiceDraftInput): Promise<SbisInvoiceDraftResult> {
        // Without Тип SBIS defaults to ДокОтгрИсх (исходящая «Реализация»), not a payment invoice.
        const docType = (process.env.SBIS_INVOICE_DOC_TYPE || 'СчетИсх').trim();
        const regulationId = (process.env.SBIS_INVOICE_REGULATION_ID || '').trim();
        const productCode = (process.env.SBIS_INVOICE_PRODUCT_CODE || '').trim();
        const amountStr = input.amountRub.toFixed(2);

        const document: Record<string, unknown> = {
            Дата: this.formatDateForSbis(input.documentDate),
            Сумма: amountStr,
            Примечание: input.paymentPurpose,
            НашаОрганизация: this.buildOurOrgBlock(input.ourOrganizationInn, input.ourOrganizationKpp),
            Контрагент: this.buildCounterpartyBlock(input),
        };
        document.Тип = docType;
        if (input.number) document.Номер = input.number;
        if (productCode) document.КодНоменклатуры = productCode;
        if (regulationId) {
            document.Регламент = { Идентификатор: regulationId };
        }

        const result = (await this.callRpc<Record<string, unknown>>('СБИС.ЗаписатьДокумент', {
            Документ: document,
        })) as Record<string, unknown>;

        const doc = (result.Документ ?? result) as Record<string, unknown>;
        const documentId =
            this.pickString(doc, 'Идентификатор') ||
            this.pickString(result, 'Идентификатор') ||
            '';
        if (!documentId) {
            throw new HttpException('SBIS did not return document id', HttpStatus.BAD_GATEWAY);
        }

        const revision = doc.Редакция as Record<string, unknown> | undefined;
        return {
            documentId,
            revisionId: this.pickString(revision, 'Идентификатор'),
            sbisNumber: this.pickString(doc, 'Номер'),
            sbisUrl:
                this.pickString(doc, 'СсылкаДляНашаОрганизация', 'Ссылка') ||
                this.pickString(result, 'СсылкаДляНашаОрганизация', 'Ссылка'),
        };
    }

    private extractPdfUrlFromReadDoc(result: unknown): string | null {
        const root = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
        const doc = (root.Документ ?? root) as Record<string, unknown>;
        const attachments = doc.Вложение;
        const list = Array.isArray(attachments) ? attachments : attachments ? [attachments] : [];

        for (const att of list) {
            const a = att as Record<string, unknown>;
            const file = a.Файл as Record<string, unknown> | undefined;
            if (!file) continue;
            const name = String(file.Имя || a.Название || '').toLowerCase();
            const link = this.pickString(file, 'Ссылка');
            if (link && (name.endsWith('.pdf') || name.includes('pdf') || !name)) {
                return link;
            }
            const representations = file.Представление;
            const reps = Array.isArray(representations) ? representations : representations ? [representations] : [];
            for (const rep of reps) {
                const r = rep as Record<string, unknown>;
                const repFile = r.Файл as Record<string, unknown> | undefined;
                const repLink = this.pickString(repFile, 'Ссылка') || this.pickString(r, 'Ссылка');
                const repName = String(repFile?.Имя || r.Название || '').toLowerCase();
                if (repLink && repName.includes('pdf')) return repLink;
            }
        }

        const stages = doc.Этап;
        const stageList = Array.isArray(stages) ? stages : stages ? [stages] : [];
        for (const stage of stageList) {
            const url = this.extractPdfUrlFromReadDoc({ Документ: { Вложение: (stage as Record<string, unknown>).Вложение } });
            if (url) return url;
        }

        return null;
    }

    async fetchDocumentPdfBytes(documentId: string): Promise<Buffer> {
        const readResult = await this.callRpc<unknown>('СБИС.ПрочитатьДокумент', {
            Документ: { Идентификатор: documentId },
        });
        const pdfUrl = this.extractPdfUrlFromReadDoc(readResult);
        if (!pdfUrl) {
            throw new HttpException('SBIS PDF representation not found', HttpStatus.NOT_FOUND);
        }

        const sid = await this.auth();
        const { data } = await firstValueFrom(
            this.http.get(pdfUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: sid ? { 'X-SBISSessionID': sid } : {},
            }),
        );
        return Buffer.from(data);
    }

    /** Legacy stub used by closing.task / resend — extended later for EDO send */
    async enqueueDocument(type: string, payload: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
        if (!this.isConfigured()) return { ok: false, detail: 'no_session' };
        try {
            await this.auth();
            return { ok: true, detail: `queued:${type}:${String(payload.id || '')}` };
        } catch (e) {
            return { ok: false, detail: (e as Error).message };
        }
    }
}
