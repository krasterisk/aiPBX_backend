import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/sequelize';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { EgrulCache } from './egrul-cache.model';
import type {
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
            this.logger.warn(`SBIS auth unexpected response: ${JSON.stringify(data)?.slice(0, 500)}`);
        } catch (e) {
            this.logger.warn(`SBIS auth error: ${(e as Error).message}`);
        }
        return null;
    }

    private async callRpc<T>(method: string, params: unknown, retried = false): Promise<T> {
        const sid = await this.auth();
        if (!sid) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }
        const body = {
            jsonrpc: '2.0',
            method,
            params,
            id: Date.now(),
        };
        try {
            const { data, status } = await firstValueFrom(
                this.http.post(RPC_URL, body, {
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
                return this.callRpc<T>(method, params, true);
            }
            if (data?.error) {
                const msg =
                    data.error?.message ||
                    data.error?.details ||
                    JSON.stringify(data.error)?.slice(0, 400);
                throw new HttpException(`SBIS RPC ${method}: ${msg}`, HttpStatus.BAD_GATEWAY);
            }
            return data?.result as T;
        } catch (e) {
            if (e instanceof HttpException) throw e;
            const ax = e as AxiosError;
            if (ax.response?.status === 401 && !retried) {
                this.sessionId = null;
                this.sessionExpiresAt = 0;
                return this.callRpc<T>(method, params, true);
            }
            throw new HttpException(
                `SBIS RPC ${method} failed: ${(e as Error).message}`,
                HttpStatus.BAD_GATEWAY,
            );
        }
    }

    private pickString(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
        if (!obj) return null;
        for (const key of keys) {
            const v = obj[key];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        return null;
    }

    private mapCounterpartyFromSbis(raw: unknown, inn: string, kpp?: string | null): CounterpartyLookupResult {
        const root = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const counterparty = (root.Контрагент ?? root) as Record<string, unknown>;
        const svUl = (counterparty.СвЮЛ ?? counterparty) as Record<string, unknown>;
        const svFl = counterparty.СвФЛ as Record<string, unknown> | undefined;
        const isIp = inn.replace(/\D/g, '').length === 12 || !!svFl;

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
            kpp: kpp || this.pickString(svUl, 'КПП', 'KPP'),
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

    async lookupCounterparty(innRaw: string, kppRaw?: string | null): Promise<CounterpartyLookupResult> {
        const inn = innRaw.replace(/\D/g, '');
        if (inn.length !== 10 && inn.length !== 12) {
            throw new HttpException('Invalid INN length', HttpStatus.BAD_REQUEST);
        }
        const kpp = kppRaw?.replace(/\D/g, '') || null;

        const cached = await this.egrulCacheModel.findByPk(inn);
        if (cached && new Date(cached.expiresAt) > new Date()) {
            const payload = cached.payload as unknown as CounterpartyLookupResult;
            return { ...payload, fromCache: true };
        }

        if (!this.isConfigured()) {
            throw new HttpException('SBIS is not configured', HttpStatus.SERVICE_UNAVAILABLE);
        }

        const findParams: Record<string, string> = { ИНН: inn };
        if (kpp) findParams.КПП = kpp;

        let findResult: Record<string, unknown> | null = null;
        try {
            findResult = (await this.callRpc<Record<string, unknown>>(
                'Контрагент.ПоИННКППКФ',
                findParams,
            )) as Record<string, unknown>;
        } catch (e) {
            this.logger.warn(`Контрагент.ПоИННКППКФ: ${(e as Error).message}`);
        }

        const infoFilter: Record<string, unknown> = {
            Контрагент: inn.length === 12
                ? { СвФЛ: { ИНН: inn } }
                : { СвЮЛ: { ИНН: inn, ...(kpp ? { КПП: kpp } : {}) } },
        };

        let infoResult: unknown = null;
        try {
            infoResult = await this.callRpc<unknown>('СБИС.ИнформацияОКонтрагенте', infoFilter);
        } catch (e) {
            this.logger.warn(`СБИС.ИнформацияОКонтрагенте: ${(e as Error).message}`);
        }

        const merged = this.mapCounterpartyFromSbis(
            infoResult ?? findResult ?? {},
            inn,
            kpp || this.pickString(findResult ?? undefined, 'КПП'),
        );

        if (!merged.name && findResult) {
            const fromFind = this.mapCounterpartyFromSbis(findResult, inn, kpp);
            merged.name = fromFind.name || merged.name;
            merged.address = merged.address || fromFind.address;
            merged.kpp = merged.kpp || fromFind.kpp;
            merged.sbisCounterpartyId = merged.sbisCounterpartyId || fromFind.sbisCounterpartyId;
        }

        if (!merged.name) {
            throw new HttpException(
                'Counterparty not found in SBIS',
                HttpStatus.NOT_FOUND,
            );
        }

        merged.legalForm = merged.legalForm || this.legalFormFromInn(inn);
        merged.fromCache = false;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + this.cacheTtlDays());
        await this.egrulCacheModel.upsert({
            inn,
            kpp: merged.kpp,
            payload: merged as unknown as Record<string, unknown>,
            source: 'saby_edo',
            fetchedAt: new Date(),
            expiresAt,
        });

        return merged;
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
        const docType = (process.env.SBIS_INVOICE_DOC_TYPE || '').trim();
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
        if (docType) document.Тип = docType;
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
