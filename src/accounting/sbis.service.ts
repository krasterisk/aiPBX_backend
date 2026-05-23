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
    SbisEdoInvitationResult,
    SbisEdoInvitationState,
    SbisEdoSendResult,
    SbisInvoiceDraftInput,
    SbisInvoiceDraftResult,
    SbisUpdDraftInput,
    SbisUpdDraftResult,
} from './sbis.types';
import { parsePersonFio } from './sbis-invoice-party';
import { SBIS_CHETOP_ATTACHMENT_META } from './sbis-chetop-attachment';
import { stripLineItemPersonalAccountFromSubject } from './subject-resolver';
import {
    buildInvoiceChetopXml,
    formatIsoDateRu,
    type InvoiceChetopBuildResult,
} from './xml/invoice-chetop-xml';
import {
    buildUpdNschfdopprXml,
    type UpdNschfdopprBuildResult,
} from './xml/upd-nschfdoppr-xml';

export type SbisEdoSendOptions = {
    certThumbprint?: string | null;
    usePrepareAction?: boolean;
    /** Force Сертификат.Ключ.Тип = Отложенный / ОтложенныйСПодтверждением */
    useDeferredSign?: boolean;
};

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

    edoOperatorLabel(participantId: string | null | undefined): string | null {
        if (!participantId?.trim()) return null;
        const prefix = participantId.trim().slice(0, 3).toUpperCase();
        if (prefix === '2BE') return 'Saby (Тензор)';
        if (prefix === '2BM') return 'Diadoc (Контур)';
        return `Оператор ${prefix}`;
    }

    private enrichCounterpartyLookup(data: CounterpartyLookupResult): CounterpartyLookupResult {
        const label = this.edoOperatorLabel(data.sbisCounterpartyId);
        return {
            ...data,
            edoOperatorLabel: label,
        };
    }

    private wrapLookupApiResult(
        result: CounterpartyLookupApiResult,
    ): CounterpartyLookupApiResult {
        if (result.status === 'single') {
            return { status: 'single', data: this.enrichCounterpartyLookup(result.data) };
        }
        if (result.status === 'choose') {
            return {
                status: 'choose',
                inn: result.inn,
                candidates: result.candidates.map((c) => this.enrichCounterpartyLookup(c)),
            };
        }
        return result;
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
                this.pickString(counterparty, '@Лицо', 'Идентификатор', 'id', 'ИдентификаторАЯ') ||
                (counterparty['@Лицо'] != null ? String(counterparty['@Лицо']) : null),
            edoOperatorLabel: null,
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
                return this.wrapLookupApiResult({
                    status: 'single',
                    data: { ...payload, kpp: cachedKpp, fromCache: true },
                });
            }
        }

        if (!this.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        if (this.isLegalEntityInn(inn) && kppInput && !kpp) {
            return { status: 'requires_kpp', inn };
        }

        if (this.isLegalEntityInn(inn) && !kpp) {
            return this.wrapLookupApiResult(await this.lookupCounterpartyByInnOnly(inn));
        }

        const data = await this.lookupCounterpartyFull(inn, kpp);
        return this.wrapLookupApiResult({ status: 'single', data });
    }

    private buildOurOrgBlock(innOverride?: string | null, kppOverride?: string | null): Record<string, unknown> {
        const inn = (innOverride || '').trim();
        const kpp = (kppOverride || '').trim();
        if (!inn) {
            throw new HttpException(
                'Issuer INN is required for SBIS document (configure tenant ourOrganizationId)',
                HttpStatus.BAD_REQUEST,
            );
        }
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

    private buildCounterpartyBlock(input: {
        counterpartyInn: string;
        counterpartyName: string;
        counterpartyKpp?: string | null;
        legalForm?: OrganizationLegalForm;
    }): Record<string, unknown> {
        const inn = input.counterpartyInn.replace(/\D/g, '');
        const kpp = input.counterpartyKpp?.replace(/\D/g, '') || '';
        const name = (input.counterpartyName || '').trim();
        if (input.legalForm === 'ip' || inn.length === 12) {
            const fio = parsePersonFio(name);
            return {
                СвФЛ: {
                    ИНН: inn,
                    Фамилия: fio.family,
                    ...(fio.first ? { Имя: fio.first } : {}),
                    ...(fio.patronymic ? { Отчество: fio.patronymic } : {}),
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

    /**
     * How ON_CHETOP is attached to СчетИсх in SBIS.
     * write_enclosure (default): shell via ЗаписатьДокумент, then XML via ЗаписатьВложение (only Файл — like alfawebhook act).
     * inline: single ЗаписатьДокумент with ДвоичныеДанные + ЭДОСч metadata.
     */
    invoiceChetopAttachMode(): 'inline' | 'write_enclosure' {
        const raw = (process.env.SBIS_INVOICE_CHEOP_ATTACH_MODE || 'write_enclosure').trim().toLowerCase();
        return raw === 'inline' ? 'inline' : 'write_enclosure';
    }

    closingUpdAttachMode(): 'inline' | 'write_enclosure' {
        const raw = (
            process.env.SBIS_CLOSING_UPD_ATTACH_MODE ||
            process.env.SBIS_INVOICE_CHEOP_ATTACH_MODE ||
            'write_enclosure'
        )
            .trim()
            .toLowerCase();
        return raw === 'inline' ? 'inline' : 'write_enclosure';
    }

    /** ЗаписатьВложение: only file bytes and name; SBIS imports ON_CHETOP from content (alfawebhook PP_AKT pattern). */
    private buildFormalXmlEnclosurePayload(formal: { fileName: string; xmlBase64: string }): Record<string, unknown> {
        return {
            Файл: {
                Имя: formal.fileName,
                ДвоичныеДанные: formal.xmlBase64,
            },
        };
    }

    /** ЗаписатьВложение: only file bytes and name; SBIS imports ON_CHETOP from content (alfawebhook PP_AKT pattern). */
    private buildChetopEnclosurePayload(chetop: InvoiceChetopBuildResult): Record<string, unknown> {
        return this.buildFormalXmlEnclosurePayload(chetop);
    }

    /** ЗаписатьДокумент inline: full formal attachment requisites per SBIS doc API. */
    private buildFormalChetopAttachmentPayload(chetop: InvoiceChetopBuildResult): Record<string, unknown> {
        const attachmentType =
            (process.env.SBIS_INVOICE_ATTACHMENT_TYPE || SBIS_CHETOP_ATTACHMENT_META.Тип).trim();
        return {
            Тип: attachmentType,
            Версия: SBIS_CHETOP_ATTACHMENT_META.Версия,
            Подтип: SBIS_CHETOP_ATTACHMENT_META.Подтип,
            ПодВерсия: SBIS_CHETOP_ATTACHMENT_META.ПодВерсия,
            Название: SBIS_CHETOP_ATTACHMENT_META.Название,
            Файл: {
                Имя: chetop.fileName,
                ДвоичныеДанные: chetop.xmlBase64,
            },
        };
    }

    private buildInvoiceChetopForDraft(input: SbisInvoiceDraftInput, productCode: string): InvoiceChetopBuildResult | null {
        if (!input.seller || !input.buyer) return null;
        const dateRu = formatIsoDateRu(input.documentDate);
        const personalAccountNote = input.personalAccountNumber
            ? `л/с ${input.personalAccountNumber}`
            : null;
        return buildInvoiceChetopXml({
            number: input.number,
            documentDate: input.documentDate,
            amountRub: input.amountRub,
            lineItemName: stripLineItemPersonalAccountFromSubject(input.subject),
            productCode: productCode || null,
            paymentDesignation: `Оплата по счету № ${input.number} от ${dateRu}`,
            infoPolNote: input.paymentPurpose,
            personalAccountNote,
            seller: input.seller,
            buyer: input.buyer,
        });
    }

    private buildUpdFormalForDraft(
        input: SbisUpdDraftInput,
        productCode: string,
        sbisNumber?: string | null,
    ): UpdNschfdopprBuildResult | null {
        if (!input.seller || !input.buyer) return null;
        const personalAccountNote = input.personalAccountNumber
            ? `л/с ${input.personalAccountNumber}`
            : null;
        const number = (sbisNumber || input.number || '').trim() || null;
        return buildUpdNschfdopprXml({
            number,
            documentDate: input.documentDate,
            periodFrom: input.periodFrom,
            periodTo: input.periodTo,
            amountRub: input.amountRub,
            lineItemName: stripLineItemPersonalAccountFromSubject(input.subject),
            productCode: productCode || null,
            note: input.note,
            personalAccountNote,
            seller: input.seller,
            buyer: input.buyer,
        });
    }

    async writeFormalUpdAttachment(documentId: string, formal: UpdNschfdopprBuildResult): Promise<void> {
        const document: Record<string, unknown> = {
            Идентификатор: documentId,
            Вложение: this.buildFormalXmlEnclosurePayload(formal),
        };
        await this.callRpc<Record<string, unknown>>('СБИС.ЗаписатьВложение', { Документ: document });
        this.logger.log(
            `SBIS ${documentId}: ON_NSCHFDOPPR attached via ЗаписатьВложение (${formal.fileName})`,
        );
    }

    /**
     * Attaches ON_CHETOP after СчетИсх shell exists.
     * Same shape as alfawebhook sbisWriteAttach: only Документ.Идентификатор + Вложение.Файл (no Тип/Редакция).
     */
    async writeFormalChetopAttachment(documentId: string, chetop: InvoiceChetopBuildResult): Promise<void> {
        const document: Record<string, unknown> = {
            Идентификатор: documentId,
            Вложение: this.buildChetopEnclosurePayload(chetop),
        };
        await this.callRpc<Record<string, unknown>>('СБИС.ЗаписатьВложение', { Документ: document });
        this.logger.log(
            `SBIS ${documentId}: ON_CHETOP attached via ЗаписатьВложение (${chetop.fileName})`,
        );
    }

    async createInvoiceDraft(input: SbisInvoiceDraftInput): Promise<SbisInvoiceDraftResult> {
        // Without Тип SBIS defaults to ДокОтгрИсх (исходящая «Реализация»), not a payment invoice.
        const docType = (process.env.SBIS_INVOICE_DOC_TYPE || 'СчетИсх').trim();
        const regulationId = (process.env.SBIS_INVOICE_REGULATION_ID || '').trim();
        const productCode = (process.env.SBIS_INVOICE_PRODUCT_CODE || '').trim();
        const amountStr = input.amountRub.toFixed(2);

        const chetop = this.buildInvoiceChetopForDraft(input, productCode);
        const attachInline = chetop && this.invoiceChetopAttachMode() === 'inline';

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
        if (attachInline && chetop) {
            document.Вложение = [this.buildFormalChetopAttachmentPayload(chetop)];
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

        const revisionId = this.pickString(this.asRecord(doc.Редакция), 'Идентификатор');

        if (chetop && !attachInline) {
            await this.writeFormalChetopAttachment(documentId, chetop);
        }

        return {
            documentId,
            revisionId,
            sbisNumber: this.pickString(doc, 'Номер'),
            sbisUrl:
                this.pickString(doc, 'СсылкаДляНашаОрганизация', 'Ссылка') ||
                this.pickString(result, 'СсылкаДляНашаОрганизация', 'Ссылка'),
        };
    }

    /** Monthly closing UPD (USN status 2): shell without Номер, then ON_NSCHFDOPPR with SBIS number. */
    async createUpdDraft(input: SbisUpdDraftInput): Promise<SbisUpdDraftResult> {
        const docType = (process.env.SBIS_CLOSING_DOC_TYPE || 'ДокОтгрИсх').trim();
        const productCode = (process.env.SBIS_CLOSING_PRODUCT_CODE || '').trim();
        const amountStr = input.amountRub.toFixed(2);
        const skipStatus2 = (process.env.SBIS_CLOSING_UPD_STATUS || '').trim().toLowerCase() === 'off';
        const hasParties = Boolean(input.seller && input.buyer);

        const document: Record<string, unknown> = {
            Тип: docType,
            Дата: this.formatDateForSbis(input.documentDate),
            Сумма: amountStr,
            Примечание: input.note,
            НашаОрганизация: this.buildOurOrgBlock(input.ourOrganizationInn, input.ourOrganizationKpp),
            Контрагент: this.buildCounterpartyBlock(input),
        };
        if (productCode) document.КодНоменклатуры = productCode;
        if (!skipStatus2) {
            document.ФункцияКЧ = false;
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

        let revisionId = this.pickString(this.asRecord(doc.Редакция), 'Идентификатор');
        let sbisNumber = this.pickString(doc, 'Номер');

        if (hasParties) {
            const formal = this.buildUpdFormalForDraft(input, productCode, sbisNumber);
            if (formal) {
                await this.writeFormalUpdAttachment(documentId, formal);
                const refreshed = await this.readDocumentRecord(documentId);
                revisionId = this.extractRevisionId(refreshed, revisionId);
                sbisNumber = this.pickString(refreshed, 'Номер') || sbisNumber;
            }
        }

        return {
            documentId,
            revisionId,
            sbisNumber,
            sbisUrl:
                this.pickString(doc, 'СсылкаДляНашаОрганизация', 'Ссылка') ||
                this.pickString(result, 'СсылкаДляНашаОрганизация', 'Ссылка'),
        };
    }

    private sleepMs(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** SBIS generates PDF/HTML representation asynchronously on first request. */
    private isSbisPdfRepresentationPending(err: unknown): boolean {
        const parts: string[] = [];
        if (err instanceof HttpException) {
            const body = err.getResponse();
            if (typeof body === 'string') parts.push(body);
            else if (body && typeof body === 'object') {
                const o = body as Record<string, unknown>;
                parts.push(String(o.message || ''));
                parts.push(String(o.details || ''));
                parts.push(String(o.error || ''));
            }
        }
        if (err instanceof Error) parts.push(err.message);
        const ax = err as AxiosError | undefined;
        if (ax?.response?.data) {
            const data = ax.response.data;
            parts.push(
                typeof data === 'string'
                    ? data
                    : Buffer.isBuffer(data)
                      ? data.toString('utf8', 0, 500)
                      : '',
            );
        }
        const text = parts.join(' ').toLowerCase();
        return (
            text.includes('1aa0000f1002') ||
            text.includes('pdf pending') ||
            text.includes('representation pending') ||
            (text.includes('представлен') && text.includes('формир'))
        );
    }

    private bufferLooksLikePdf(data: ArrayBuffer | Buffer): boolean {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-';
    }

    /**
     * PDF for formalized docs (UPD/ON_NSCHFDOPPR, ЭДОСч): use СсылкаНаPDF on document or attachment,
     * not Файл.Ссылка (that points at source XML).
     * @see https://saby.ru/help/integration/api/sequence/visual_doc
     */
    private extractPdfUrlFromReadDoc(result: unknown): string | null {
        const root = (result && typeof result === 'object' ? result : {}) as Record<string, unknown>;
        const doc = (root.Документ ?? root) as Record<string, unknown>;

        const docPdf = this.pickString(doc, 'СсылкаНаPDF');
        if (docPdf) return docPdf;

        for (const att of this.asArray(doc.Вложение)) {
            const attPdf = this.pickString(att, 'СсылкаНаPDF');
            if (attPdf) return attPdf;

            const file = this.asRecord(att.Файл);
            if (!file) continue;

            const filePdf = this.pickString(file, 'СсылкаНаPDF');
            if (filePdf) return filePdf;

            const name = String(file.Имя || att.Название || '').toLowerCase();
            const link = this.pickString(file, 'Ссылка');
            if (link && name.endsWith('.pdf')) return link;

            for (const rep of this.asArray(file.Представление)) {
                const repPdf = this.pickString(rep, 'СсылкаНаPDF') || this.pickString(rep, 'Ссылка');
                const repFile = this.asRecord(rep.Файл);
                const repFilePdf =
                    this.pickString(repFile, 'СсылкаНаPDF') || this.pickString(repFile, 'Ссылка');
                const repName = String(repFile?.Имя || rep.Название || '').toLowerCase();
                if (repFilePdf && (repName.includes('pdf') || repName.endsWith('.pdf'))) return repFilePdf;
                if (repPdf && repName.includes('pdf')) return repPdf;
            }
        }

        for (const stage of this.asArray(doc.Этап)) {
            const url = this.extractPdfUrlFromReadDoc({
                Документ: { Вложение: stage.Вложение },
            });
            if (url) return url;
        }

        return null;
    }

    private async downloadPdfFromSbisUrl(pdfUrl: string): Promise<Buffer> {
        const sid = await this.auth();
        try {
            const { data, headers } = await firstValueFrom(
                this.http.get(pdfUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: sid ? { 'X-SBISSessionID': sid } : {},
                }),
            );
            const buf = Buffer.from(data);
            const contentType = String(headers['content-type'] || '').toLowerCase();
            if (this.bufferLooksLikePdf(buf) || contentType.includes('pdf')) {
                return buf;
            }
            const snippet = buf.subarray(0, 400).toString('utf8');
            if (snippet.includes('1AA0000F1002')) {
                throw new HttpException('SBIS PDF representation pending', HttpStatus.SERVICE_UNAVAILABLE);
            }
            return buf;
        } catch (e) {
            if (e instanceof HttpException && this.isSbisPdfRepresentationPending(e)) {
                throw e;
            }
            if (e instanceof HttpException) throw e;
            const ax = e as AxiosError;
            const body = ax.response?.data;
            const text =
                typeof body === 'string'
                    ? body
                    : Buffer.isBuffer(body)
                      ? body.toString('utf8', 0, 500)
                      : '';
            if (text.includes('1AA0000F1002')) {
                throw new HttpException('SBIS PDF representation pending', HttpStatus.SERVICE_UNAVAILABLE);
            }
            throw e;
        }
    }

    private asRecord(value: unknown): Record<string, unknown> | null {
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    }

    private asArray(value: unknown): Record<string, unknown>[] {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.map((v) => this.asRecord(v)).filter((v): v is Record<string, unknown> => v != null);
        }
        const one = this.asRecord(value);
        return one ? [one] : [];
    }

    edoAutoSendEnabled(): boolean {
        const raw = (process.env.SBIS_EDO_AUTO_SEND ?? 'true').trim().toLowerCase();
        return !['0', 'false', 'no', 'off'].includes(raw);
    }

    private edoSendActionName(): string {
        return (process.env.SBIS_EDO_ACTION_NAME || 'Отправить').trim() || 'Отправить';
    }

    private buildEdoCertificateBlock(
        thumbprintOverride?: string | null,
        options?: { useDeferredSign?: boolean },
    ): Record<string, unknown> | undefined {
        const thumbprint = (thumbprintOverride || process.env.SBIS_EDO_CERT_THUMBPRINT || '').trim();
        let keyType = (process.env.SBIS_EDO_SIGN_KEY_TYPE || '').trim();
        if (options?.useDeferredSign) {
            keyType = keyType || this.edoDeferredSignKeyType();
        }
        const cert: Record<string, unknown> = {};
        if (thumbprint) cert.Отпечаток = thumbprint;
        if (keyType) cert.Ключ = { Тип: keyType };
        return Object.keys(cert).length ? cert : undefined;
    }

    /** Отложенный | ОтложенныйСПодтверждением — see SBIS delegate API. */
    edoDeferredSignKeyType(): string {
        const raw = (process.env.SBIS_EDO_DEFERRED_SIGN_TYPE || 'Отложенный').trim();
        return raw || 'Отложенный';
    }

    edoDeferredSignEnabled(): boolean {
        const raw = (process.env.SBIS_EDO_DEFERRED_SIGN ?? '').trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
        const keyType = (process.env.SBIS_EDO_SIGN_KEY_TYPE || '').trim().toLowerCase();
        return keyType.includes('отложен');
    }

    isEdoAwaitingOwnerSignature(stateCode: string | null, stateName: string | null): boolean {
        if (stateCode === '23') return true;
        const name = (stateName || '').toLowerCase();
        return name.includes('ожида') && name.includes('подпис');
    }

    /** Formalized ON_CHETOP (ЭДОСч) must be signed before send. */
    documentHasFormalChetopAttachment(doc: Record<string, unknown>): boolean {
        const attachmentType =
            (process.env.SBIS_INVOICE_ATTACHMENT_TYPE || SBIS_CHETOP_ATTACHMENT_META.Тип).trim() || 'ЭДОСч';
        const list = this.asArray(doc.Вложение);
        return list.some((att) => {
            const type = (this.pickString(att, 'Тип') || '').trim();
            if (type === attachmentType || type === 'ЭДОСч') return true;
            const file = this.asRecord(att.Файл);
            const name = (this.pickString(file, 'Имя') || this.pickString(att, 'Название') || '').toUpperCase();
            return name.startsWith('ON_CHETOP_') && name.endsWith('.XML');
        });
    }

    documentHasFormalUpdAttachment(doc: Record<string, unknown>): boolean {
        const list = this.asArray(doc.Вложение);
        return list.some((att) => {
            const file = this.asRecord(att.Файл);
            const name = (this.pickString(file, 'Имя') || this.pickString(att, 'Название') || '').toUpperCase();
            return name.startsWith('ON_NSCHFDOPPR_') && name.endsWith('.XML');
        });
    }

    /** ON_CHETOP or ON_NSCHFDOPPR — formalized XML that needs ПодготовитьДействие before EDO send. */
    documentHasFormalEdoAttachment(doc: Record<string, unknown>): boolean {
        return this.documentHasFormalChetopAttachment(doc) || this.documentHasFormalUpdAttachment(doc);
    }

    isSbisEdoMissingSignatureError(error: SbisRpcErrorDetail | { message?: string; details?: string }): boolean {
        const text = [error.message, (error as SbisRpcErrorDetail).details]
            .filter((s): s is string => typeof s === 'string' && !!s.trim())
            .join(' ')
            .toLowerCase();
        return (
            text.includes('не приложен файл подписи') ||
            text.includes('не хватает подписи') ||
            text.includes('файл подписи')
        );
    }

    private findOutgoingStageRecord(
        doc: Record<string, unknown>,
        stageId: string | null,
    ): Record<string, unknown> | null {
        const stages = this.asArray(doc.Этап);
        if (stageId) {
            const byId = stages.find((s) => this.pickString(s, 'Идентификатор') === stageId);
            if (byId) return byId;
        }
        for (const stage of stages) {
            const stageName = (this.pickString(stage, 'Название') || '').toLowerCase();
            if (stageName.includes('отправ')) return stage;
        }
        return stages[0] ?? null;
    }

    private attachmentHasSignaturePayload(att: Record<string, unknown>): boolean {
        return this.asArray(att.Подпись).some((sign) => {
            const file = this.asRecord(sign.Файл);
            return !!(this.pickString(file, 'ДвоичныеДанные') || this.pickString(file, 'Ссылка'));
        });
    }

    /**
     * Only attachments that already have Подпись.Файл may be passed in ВыполнитьДействие.
     * Passing Идентификатор without Подпись tells SBIS the client will supply .sgn (API error otherwise).
     */
    private mapSignedAttachmentsForExecute(
        doc: Record<string, unknown>,
        stageId: string | null,
    ): Record<string, unknown>[] {
        const stage = this.findOutgoingStageRecord(doc, stageId);
        const fromStage = stage
            ? this.asArray(stage.Вложение)
                  .map((att) => this.mapOneStageAttachmentForExecute(att))
                  .filter((att) => this.attachmentHasSignaturePayload(att))
            : [];

        if (fromStage.length) return fromStage;

        return this.asArray(doc.Вложение)
            .map((att) => this.mapOneStageAttachmentForExecute(att))
            .filter((att) => this.attachmentHasSignaturePayload(att));
    }

    private logPreparedSigningDiagnostics(documentId: string, doc: Record<string, unknown>): void {
        const parts: string[] = [];
        for (const att of this.asArray(doc.Вложение)) {
            const file = this.asRecord(att.Файл);
            const name = this.pickString(file, 'Имя') || this.pickString(att, 'Название') || '?';
            const signed = this.attachmentHasSignaturePayload(att);
            const hash = this.pickString(file, 'Хеш');
            parts.push(
                signed ? `${name}:signed` : hash ? `${name}:hash-only` : `${name}:unsigned`,
            );
        }
        if (parts.length) {
            this.logger.warn(
                `SBIS ${documentId}: after prepare, attachments: ${parts.join('; ')}. ` +
                    'API cannot sign without server/cloud key or local CryptoPro — use deferred signing or sign in Saby UI.',
            );
        }
    }

    private mapOneStageAttachmentForExecute(att: Record<string, unknown>): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        const id = this.pickString(att, 'Идентификатор');
        if (id) out.Идентификатор = id;

        const signs: Record<string, unknown>[] = [];
        for (const sign of this.asArray(att.Подпись)) {
            const file = this.asRecord(sign.Файл);
            if (!file) continue;
            const sigFile: Record<string, unknown> = {};
            const binary = this.pickString(file, 'ДвоичныеДанные');
            const link = this.pickString(file, 'Ссылка');
            if (binary) sigFile.ДвоичныеДанные = binary;
            else if (link) sigFile.Ссылка = link;
            else continue;
            const name = this.pickString(file, 'Имя');
            if (name) sigFile.Имя = name;
            signs.push({ Файл: sigFile });
        }

        if (signs.length > 0) out.Подпись = signs;
        return out;
    }

    private shouldUseSeparateEdoPrepare(
        doc: Record<string, unknown>,
        options?: SbisEdoSendOptions,
    ): boolean {
        if (options?.usePrepareAction !== undefined) return options.usePrepareAction;
        if (this.edoUsePrepareAction()) return true;
        return this.documentHasFormalEdoAttachment(doc);
    }

    /**
     * Separate ПодготовитьДействие before ВыполнитьДействие is opt-in only.
     * SBIS already calls prepare inside ВыполнитьДействие; double prepare causes
     * «Отсутствуют документы, требующие отправки».
     */
    edoUsePrepareAction(): boolean {
        const raw = (process.env.SBIS_EDO_USE_PREPARE ?? 'false').trim().toLowerCase();
        return !['0', 'false', 'no', 'off'].includes(raw);
    }

    private parseSbisDateTime(value: string | null | undefined): Date | null {
        if (!value?.trim()) return null;
        const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2})\.(\d{2})\.(\d{2})$/);
        if (!m) return null;
        return new Date(
            Number(m[3]),
            Number(m[2]) - 1,
            Number(m[1]),
            Number(m[4]),
            Number(m[5]),
            Number(m[6]),
        );
    }

    private extractInnKppFromInvitationCounterparty(
        ctr: Record<string, unknown> | null | undefined,
    ): { inn: string | null; kpp: string | null } {
        if (!ctr) return { inn: null, kpp: null };
        const svUl = this.asRecord(ctr.СвЮЛ);
        const svFl = this.asRecord(ctr.СвФЛ);
        const inn =
            this.pickString(ctr, 'ИНН') ||
            this.pickString(svUl, 'ИНН') ||
            this.pickString(svFl, 'ИНН');
        const innDigits = inn?.replace(/\D/g, '') || null;
        const kppRaw =
            this.pickString(ctr, 'КПП') ||
            this.extractKppFromSbisObject(ctr) ||
            this.pickString(svUl, 'КПП');
        const kpp = innDigits ? this.sanitizeKpp(kppRaw, innDigits) : kppRaw?.replace(/\D/g, '') || null;
        return { inn: innDigits, kpp: kpp || null };
    }

    private mapInvitationFromRpc(raw: unknown, invitationId: string): SbisEdoInvitationState {
        const root = this.asRecord(raw);
        const inv = this.asRecord(root?.Приглашение) ?? root;
        const state = this.asRecord(inv?.Состояние);
        const our = this.asRecord(inv?.НашаОрганизация);
        const ctr = this.asRecord(inv?.Контрагент);
        const { inn, kpp } = this.extractInnKppFromInvitationCounterparty(ctr);
        const stateCodeRaw = state?.Код;
        const stateCode =
            typeof stateCodeRaw === 'number'
                ? stateCodeRaw
                : stateCodeRaw != null
                  ? Number(stateCodeRaw)
                  : null;
        return {
            invitationId,
            stateCode: Number.isFinite(stateCode as number) ? (stateCode as number) : null,
            stateDescription: this.pickString(state, 'Описание'),
            stateChangedAt: this.parseSbisDateTime(this.pickString(state, 'ДатаВремяИзменения')),
            ourEdoParticipantId: this.pickString(our, 'ИдентификаторАЯ'),
            counterpartyEdoParticipantId: this.pickString(ctr, 'ИдентификаторАЯ'),
            counterpartyInn: inn,
            counterpartyKpp: kpp,
        };
    }

    requiresRoamingEdoId(edoParticipantId: string | null | undefined): boolean {
        if (!edoParticipantId?.trim()) return false;
        const prefix = edoParticipantId.trim().slice(0, 3).toUpperCase();
        return prefix !== '2BE';
    }

    /** SBIS returns JSON-RPC error when Saby-to-Saby route already exists (no invitation needed). */
    isSbisEdoRouteAlreadyActiveError(error: SbisRpcErrorDetail): boolean {
        const text = [error.message, error.details]
            .filter((s): s is string => typeof s === 'string' && !!s.trim())
            .join(' ')
            .toLowerCase();
        return (
            text.includes('уже зарегистрирован в saby') ||
            text.includes('приглашение не требуется') ||
            text.includes('можно обмениваться документами')
        );
    }

    async sendEdoInvitation(input: {
        ourEdoParticipantId: string;
        counterpartyInn: string;
        counterpartyKpp?: string | null;
        counterpartyName?: string | null;
        counterpartyEdoParticipantId?: string | null;
        counterpartyEmail?: string | null;
        legalForm?: OrganizationLegalForm;
    }): Promise<SbisEdoInvitationResult> {
        const ourId = input.ourEdoParticipantId.trim();
        if (!ourId) {
            throw new HttpException('Issuer EDO participant id is required', HttpStatus.BAD_REQUEST);
        }

        const inn = input.counterpartyInn.replace(/\D/g, '');
        const kpp = this.sanitizeKpp(input.counterpartyKpp ?? null, inn);
        const ctrId = input.counterpartyEdoParticipantId?.trim() || null;
        if (ctrId && ctrId.startsWith('2BM') && ctrId.length < 10) {
            throw new HttpException('Invalid counterparty EDO participant id', HttpStatus.BAD_REQUEST);
        }

        const counterparty: Record<string, unknown> = { ИНН: inn };
        if (kpp) counterparty.КПП = kpp;
        if (ctrId) counterparty.ИдентификаторАЯ = ctrId;
        const name = (input.counterpartyName || '').trim();
        if (input.legalForm === 'ip' || inn.length === 12) {
            if (name) counterparty.Фамилия = name;
        } else if (name) {
            counterparty.Название = name;
        }
        if (input.counterpartyEmail?.trim()) {
            counterparty.Email = input.counterpartyEmail.trim();
        }

        const rpc = await this.executeRpc<Record<string, unknown>>('СБИС.ОтправитьПриглашение', {
            Приглашение: {
                НашаОрганизация: { ИдентификаторАЯ: ourId },
                Контрагент: counterparty,
            },
        });

        if (rpc.ok === false) {
            if (this.isSbisEdoRouteAlreadyActiveError(rpc.error)) {
                return {
                    invitationId: null,
                    stateCode: 7,
                    stateDescription: rpc.error.message,
                    alreadyConnected: true,
                };
            }
            throw new HttpException(
                {
                    message: `SBIS RPC СБИС.ОтправитьПриглашение: ${rpc.error.message}`,
                    sbis: rpc.error,
                },
                HttpStatus.BAD_GATEWAY,
            );
        }

        const result = rpc.result;
        const invitationId =
            this.pickString(result, 'Идентификатор') ||
            this.pickString(this.asRecord(result.Приглашение), 'Идентификатор');
        if (!invitationId) {
            throw new HttpException('SBIS did not return invitation id', HttpStatus.BAD_GATEWAY);
        }

        let stateCode: number | null = 2;
        let stateDescription: string | null = 'Приглашение отправлено';
        try {
            const read = await this.readEdoInvitation(invitationId);
            stateCode = read.stateCode;
            stateDescription = read.stateDescription;
        } catch {
            /* use defaults */
        }

        return { invitationId, stateCode, stateDescription };
    }

    async readEdoInvitation(invitationId: string): Promise<SbisEdoInvitationState> {
        const result = await this.callRpc<unknown>('СБИС.ПрочитатьПриглашение', {
            Приглашение: { Идентификатор: invitationId },
        });
        return this.mapInvitationFromRpc(result, invitationId);
    }

    async listEdoInvitationChanges(ourEdoParticipantId?: string | null): Promise<SbisEdoInvitationState[]> {
        const filter: Record<string, unknown> = {
            Навигация: { РазмерСтраницы: 200 },
        };
        if (ourEdoParticipantId?.trim()) {
            filter.НашаОрганизация = { ИдентификаторАЯ: ourEdoParticipantId.trim() };
        }
        const result = await this.callRpc<unknown>('СБИС.СписокИзмененийПриглашений', {
            Фильтр: filter,
        });
        const root = this.asRecord(result);
        const items: unknown[] = [];
        const inv = root?.Приглашение;
        if (Array.isArray(inv)) {
            items.push(...inv);
        } else if (inv && typeof inv === 'object') {
            items.push(inv);
        }
        return items.map((item, idx) => {
            const id =
                this.pickString(this.asRecord(item), 'Идентификатор') || `change-${idx}`;
            return this.mapInvitationFromRpc(item, id);
        });
    }

    /** Low-level prepare; prefer sendDocumentToEdo (execute-only) for outgoing invoices. */
    async prepareDocumentForEdo(
        documentId: string,
        revisionId: string | null | undefined,
        thumbprint?: string | null,
        cachedDoc?: Record<string, unknown> | null,
    ): Promise<Record<string, unknown>> {
        const doc = cachedDoc ?? (await this.readDocumentRecord(documentId));
        const sendStage = this.findOutgoingSendStage(doc);
        const actionName = sendStage?.actionName || this.edoSendActionName();

        const document = this.buildEdoActionRequest(documentId, revisionId, sendStage, actionName, thumbprint);
        const result = await this.callRpc<Record<string, unknown>>('СБИС.ПодготовитьДействие', {
            Документ: document,
        });
        const root = this.asRecord(result);
        return (this.asRecord(root?.Документ) ?? root) as Record<string, unknown>;
    }

    private extractRevisionId(
        doc: Record<string, unknown>,
        revisionId?: string | null,
    ): string | null {
        const explicit = revisionId?.trim();
        if (explicit) return explicit;
        const revision = this.asRecord(doc.Редакция);
        return this.pickString(revision, 'Идентификатор') || null;
    }

    private buildEdoActionRequest(
        documentId: string,
        revisionId: string | null | undefined,
        sendStage: { stageId: string | null; actionName: string } | null,
        actionName: string,
        thumbprint?: string | null,
        preparedDoc?: Record<string, unknown> | null,
        sendOptions?: Pick<SbisEdoSendOptions, 'useDeferredSign'>,
    ): Record<string, unknown> {
        const document: Record<string, unknown> = { Идентификатор: documentId };
        if (revisionId?.trim()) {
            document.Редакция = { Идентификатор: revisionId.trim() };
        }
        const action: Record<string, unknown> = { Название: actionName };
        const cert = this.buildEdoCertificateBlock(thumbprint, {
            useDeferredSign: sendOptions?.useDeferredSign,
        });
        if (cert) action.Сертификат = cert;

        const stage: Record<string, unknown> = { Действие: [action] };
        if (sendStage?.stageId) stage.Идентификатор = sendStage.stageId;
        else stage.Название = 'Отправка';

        const signedAttachments = preparedDoc
            ? this.mapSignedAttachmentsForExecute(preparedDoc, sendStage?.stageId ?? null)
            : [];
        if (signedAttachments.length) stage.Вложение = signedAttachments;

        document.Этап = stage;
        return document;
    }

    /** SBIS warning when execute has nothing left (often after duplicate prepare). */
    isSbisEdoNothingToSendError(error: SbisRpcErrorDetail | { message?: string }): boolean {
        const text = [error.message, (error as SbisRpcErrorDetail).details]
            .filter((s): s is string => typeof s === 'string' && !!s.trim())
            .join(' ')
            .toLowerCase();
        return text.includes('отсутствуют документы, требующие отправки');
    }

    /** No pending «Отправить» — document likely already sent or past send stage. */
    private isDocumentPastOutgoingSendStage(doc: Record<string, unknown>): boolean {
        if (this.findOutgoingSendStage(doc)) return false;
        const stateName = (this.pickString(this.asRecord(doc.Состояние), 'Название') || '').toLowerCase();
        return (
            stateName.includes('отправ') ||
            stateName.includes('достав') ||
            stateName.includes('ожида') ||
            stateName.includes('заверш') ||
            stateName.includes('исполн')
        );
    }

    async readDocumentRecord(documentId: string): Promise<Record<string, unknown>> {
        const readResult = await this.callRpc<unknown>('СБИС.ПрочитатьДокумент', {
            Документ: { Идентификатор: documentId },
        });
        const root = this.asRecord(readResult);
        return (this.asRecord(root?.Документ) ?? root) as Record<string, unknown>;
    }

    /**
     * Finds outgoing «Отправить» (or SBIS_EDO_ACTION_NAME) on the current document stage.
     */
    findOutgoingSendStage(
        doc: Record<string, unknown>,
    ): { stageId: string | null; actionName: string } | null {
        const actionName = this.edoSendActionName();
        const stages = this.asArray(doc.Этап);
        for (const stage of stages) {
            const stageName = (this.pickString(stage, 'Название') || '').toLowerCase();
            if (stageName.includes('отправ')) {
                const actions = this.asArray(stage.Действие);
                for (const action of actions) {
                    const name = this.pickString(action, 'Название');
                    if (name && name.toLowerCase() === actionName.toLowerCase()) {
                        return {
                            stageId: this.pickString(stage, 'Идентификатор'),
                            actionName: name,
                        };
                    }
                }
            }
            const actions = this.asArray(stage.Действие);
            for (const action of actions) {
                const name = this.pickString(action, 'Название');
                if (name && name.toLowerCase() === actionName.toLowerCase()) {
                    return {
                        stageId: this.pickString(stage, 'Идентификатор'),
                        actionName: name,
                    };
                }
            }
        }
        return null;
    }

    /**
     * Signs (server/deferred cert in Saby or thumbprint from env) and sends document via EDO.
     * Requires ЭП configured in Saby for the integration user (SBIS_LOGIN).
     */
    async sendDocumentToEdo(
        documentId: string,
        revisionId?: string | null,
        options?: SbisEdoSendOptions,
    ): Promise<SbisEdoSendResult> {
        const thumbprint = options?.certThumbprint ?? null;
        if (!thumbprint && !this.buildEdoCertificateBlock(null)) {
            throw new HttpException(
                'SBIS EDO certificate thumbprint is required (our_organizations.sbisCertThumbprint or SBIS_EDO_CERT_THUMBPRINT)',
                HttpStatus.BAD_REQUEST,
            );
        }

        let doc = await this.readDocumentRecord(documentId);
        let resolvedRevision = this.extractRevisionId(doc, revisionId);
        let sendStage = this.findOutgoingSendStage(doc);
        const actionName = sendStage?.actionName || this.edoSendActionName();

        let useSeparatePrepare = this.shouldUseSeparateEdoPrepare(doc, options);
        let preparedDoc: Record<string, unknown> | null = null;

        const runPrepare = async (): Promise<void> => {
            preparedDoc = await this.prepareDocumentForEdo(
                documentId,
                resolvedRevision,
                thumbprint,
                doc,
            );
            resolvedRevision = this.extractRevisionId(preparedDoc, resolvedRevision);
            sendStage = this.findOutgoingSendStage(preparedDoc) ?? sendStage;
            doc = preparedDoc;
        };

        if (useSeparatePrepare && sendStage?.stageId) {
            if (this.documentHasFormalEdoAttachment(doc)) {
                this.logger.log(
                    `SBIS ${documentId}: ПодготовитьДействие for formalized EDO attachment signing`,
                );
            }
            await runPrepare();
        }

        if (!sendStage?.stageId) {
            if (this.isDocumentPastOutgoingSendStage(doc)) {
                const state = this.asRecord(doc.Состояние);
                return {
                    documentId,
                    actionName,
                    stageId: null,
                    stateCode: this.pickString(state, 'Код'),
                    stateName: this.pickString(state, 'Название'),
                };
            }
            throw new HttpException(
                'SBIS outgoing send stage not found for document',
                HttpStatus.BAD_GATEWAY,
            );
        }

        if (preparedDoc && this.documentHasFormalEdoAttachment(preparedDoc)) {
            const signed = this.mapSignedAttachmentsForExecute(
                preparedDoc,
                sendStage?.stageId ?? null,
            );
            if (!signed.length) {
                this.logPreparedSigningDiagnostics(documentId, preparedDoc);
            }
        }

        const runExecute = async (useDeferredSign: boolean) => {
            const document = this.buildEdoActionRequest(
                documentId,
                resolvedRevision,
                sendStage,
                actionName,
                thumbprint,
                preparedDoc,
                { useDeferredSign },
            );
            return this.executeRpc<Record<string, unknown>>('СБИС.ВыполнитьДействие', {
                Документ: document,
            });
        };

        let useDeferredSign = Boolean(options?.useDeferredSign);
        let outcome = await runExecute(useDeferredSign);

        if (
            outcome.ok === false &&
            this.isSbisEdoMissingSignatureError(outcome.error) &&
            !useSeparatePrepare
        ) {
            this.logger.warn(
                `SBIS ${documentId}: missing signature on attachment, retrying with ПодготовитьДействие`,
            );
            useSeparatePrepare = true;
            await runPrepare();
            if (!sendStage?.stageId) {
                throw new HttpException(
                    'SBIS outgoing send stage not found after prepare',
                    HttpStatus.BAD_GATEWAY,
                );
            }
            if (preparedDoc) this.logPreparedSigningDiagnostics(documentId, preparedDoc);
            outcome = await runExecute(useDeferredSign);
        }

        if (
            outcome.ok === false &&
            this.isSbisEdoMissingSignatureError(outcome.error) &&
            !useDeferredSign &&
            this.edoDeferredSignEnabled()
        ) {
            this.logger.log(
                `SBIS ${documentId}: retrying ВыполнитьДействие with deferred certificate (${this.edoDeferredSignKeyType()})`,
            );
            useDeferredSign = true;
            outcome = await runExecute(true);
        }

        if (outcome.ok === false && this.isSbisEdoNothingToSendError(outcome.error)) {
            const after = await this.readDocumentRecord(documentId);
            if (this.isDocumentPastOutgoingSendStage(after)) {
                const state = this.asRecord(after.Состояние);
                this.logger.log(
                    `SBIS ${documentId}: execute reported nothing to send; document already past send stage`,
                );
                return {
                    documentId,
                    actionName,
                    stageId: sendStage.stageId,
                    stateCode: this.pickString(state, 'Код'),
                    stateName: this.pickString(state, 'Название'),
                };
            }
            throw new HttpException(
                {
                    message: `SBIS RPC СБИС.ВыполнитьДействие: ${outcome.error.message}`,
                    sbis: outcome.error,
                },
                HttpStatus.BAD_GATEWAY,
            );
        }

        if (outcome.ok === false) {
            let message = `SBIS RPC СБИС.ВыполнитьДействие: ${outcome.error.message}`;
            if (this.isSbisEdoMissingSignatureError(outcome.error)) {
                message +=
                    '. The API user cannot sign ON_CHETOP without a server/cloud key in Saby, local CryptoPro signing, ' +
                    'or deferred signing (SBIS_EDO_DEFERRED_SIGN=true and SBIS_EDO_SIGN_KEY_TYPE=Отложенный). ' +
                    'Otherwise sign and send the draft manually in Saby.';
            }
            throw new HttpException({ message, sbis: outcome.error }, HttpStatus.BAD_GATEWAY);
        }

        const result = outcome.result;
        const outDoc = this.asRecord(result.Документ) ?? result;
        const state = this.asRecord(outDoc.Состояние);
        const stateCode = this.pickString(state, 'Код');
        const stateName = this.pickString(state, 'Название');
        if (this.isEdoAwaitingOwnerSignature(stateCode, stateName)) {
            this.logger.log(
                `SBIS ${documentId}: document queued for owner signature (${stateName || stateCode})`,
            );
        }
        return {
            documentId,
            actionName,
            stageId: sendStage.stageId,
            stateCode,
            stateName,
        };
    }

    async sendInvoiceToEdo(
        draft: SbisInvoiceDraftResult,
        options?: SbisEdoSendOptions,
    ): Promise<SbisEdoSendResult> {
        return this.sendDocumentToEdo(draft.documentId, draft.revisionId, options);
    }

    async fetchDocumentPdfBytes(documentId: string): Promise<Buffer> {
        const maxAttempts = Number(process.env.SBIS_PDF_FETCH_ATTEMPTS || 8);
        const delayMs = Number(process.env.SBIS_PDF_FETCH_DELAY_MS || 2500);
        let lastError: Error | HttpException | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const readResult = await this.callRpc<unknown>('СБИС.ПрочитатьДокумент', {
                Документ: { Идентификатор: documentId },
            });
            const pdfUrl = this.extractPdfUrlFromReadDoc(readResult);
            if (!pdfUrl) {
                lastError = new HttpException(
                    'SBIS PDF representation not found',
                    HttpStatus.NOT_FOUND,
                );
                if (attempt < maxAttempts) {
                    this.logger.debug(
                        `SBIS ${documentId}: PDF link missing, retry ${attempt}/${maxAttempts}`,
                    );
                    await this.sleepMs(delayMs);
                    continue;
                }
                if (this.sbisDebugEnabled()) {
                    this.logger.warn(
                        `SBIS ${documentId}: no СсылкаНаPDF in read_doc: ${JSON.stringify(readResult).slice(0, 2000)}`,
                    );
                }
                throw lastError;
            }

            try {
                const pdf = await this.downloadPdfFromSbisUrl(pdfUrl);
                if (attempt > 1) {
                    this.logger.log(`SBIS ${documentId}: PDF ready after ${attempt} attempt(s)`);
                }
                return pdf;
            } catch (e) {
                lastError = e as Error;
                if (this.isSbisPdfRepresentationPending(e) && attempt < maxAttempts) {
                    this.logger.debug(
                        `SBIS ${documentId}: PDF generating, retry ${attempt}/${maxAttempts}`,
                    );
                    await this.sleepMs(delayMs);
                    continue;
                }
                throw e;
            }
        }

        throw (
            lastError ||
            new HttpException('SBIS PDF representation not found', HttpStatus.NOT_FOUND)
        );
    }

    async enqueueDocument(
        type: string,
        payload: Record<string, unknown>,
    ): Promise<{ ok: boolean; detail?: string }> {
        if (!this.isConfigured()) return { ok: false, detail: 'no_session' };
        const documentId = String(payload.sbisId || payload.id || '').trim();
        if (!documentId) {
            return { ok: false, detail: 'missing_document_id' };
        }
        try {
            if (!this.edoAutoSendEnabled()) {
                await this.auth();
                return { ok: true, detail: `draft_only:${type}:${documentId}` };
            }
            const sent = await this.sendDocumentToEdo(documentId, null, {
                certThumbprint: (process.env.SBIS_EDO_CERT_THUMBPRINT || '').trim() || null,
            });
            return {
                ok: true,
                detail: `sent:${type}:${documentId}:${sent.stateName || sent.stateCode || 'ok'}`,
            };
        } catch (e) {
            return { ok: false, detail: (e as Error).message };
        }
    }
}
