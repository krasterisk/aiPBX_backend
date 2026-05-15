import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Rates } from '../currency/rates.model';
import { BillingRecord } from './billing-record.model';
import { getTenantCurrency, isRubTenant } from '../shared/tenant/tenant-currency';

export type FxRateSource = 'identity' | 'rates' | 'missing' | 'backfill' | 'backfill_closing';

export interface FxSnapshot {
    currency: string;
    amountCurrency: number | null;
    rate: number | null;
    source: FxRateSource;
    capturedAt: Date;
}

export interface FxFields {
    currency: string;
    amountCurrency: number | null;
    fxRateUsdToCurrency: number | null;
    fxRateSource: FxRateSource;
    fxCapturedAt: Date;
}

function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}

/** Split totalClient across parts proportionally to USD weights; remainder goes to largest part. */
export function distributeProportional(
    parts: { key: string; usd: number }[],
    totalClient: number,
): Record<string, number> {
    if (!parts.length) return {};
    const totalUsd = parts.reduce((s, p) => s + p.usd, 0);
    if (totalUsd <= 0 || totalClient <= 0) {
        return Object.fromEntries(parts.map((p) => [p.key, 0]));
    }

    const out: Record<string, number> = {};
    let sum = 0;
    let maxKey = parts[0].key;
    let maxUsd = parts[0].usd;

    for (const p of parts) {
        const amt = round4((totalClient * p.usd) / totalUsd);
        out[p.key] = amt;
        sum += amt;
        if (p.usd > maxUsd) {
            maxUsd = p.usd;
            maxKey = p.key;
        }
    }

    const diff = round4(totalClient - sum);
    if (diff !== 0 && maxKey) {
        out[maxKey] = round4((out[maxKey] ?? 0) + diff);
    }
    return out;
}

@Injectable()
export class BillingFxService {
    private readonly logger = new Logger(BillingFxService.name);

    constructor(@InjectModel(Rates) private readonly ratesRepository: typeof Rates) {}

    toFxFields(snap: FxSnapshot): FxFields {
        return {
            currency: snap.currency,
            amountCurrency: snap.amountCurrency,
            fxRateUsdToCurrency: snap.rate,
            fxRateSource: snap.source,
            fxCapturedAt: snap.capturedAt,
        };
    }

    /** FX columns for billingRecords / aiCdr create & update. */
    async fieldsForUsdAmount(amountUsd: number, source: FxRateSource = 'rates'): Promise<FxFields> {
        return this.toFxFields(await this.captureSnapshot(amountUsd, source));
    }

    async captureSnapshot(amountUsd: number, source: FxRateSource = 'rates'): Promise<FxSnapshot> {
        const capturedAt = new Date();
        const currency = getTenantCurrency();

        if (amountUsd <= 0) {
            return {
                currency,
                amountCurrency: 0,
                rate: currency === 'USD' ? 1 : null,
                source: currency === 'USD' ? 'identity' : source,
                capturedAt,
            };
        }

        if (currency === 'USD') {
            return {
                currency: 'USD',
                amountCurrency: round4(amountUsd),
                rate: 1,
                source: 'identity',
                capturedAt,
            };
        }

        const rate = await this.usdToTenantRate(currency);
        if (rate == null) {
            this.logger.warn(`FX rate missing for ${currency}, amountUsd=${amountUsd}`);
            return { currency, amountCurrency: null, rate: null, source: 'missing', capturedAt };
        }

        return {
            currency,
            amountCurrency: round4(amountUsd * rate),
            rate,
            source,
            capturedAt,
        };
    }

    /** USD → tenant currency using current rates table (exchangerate.host snapshot). */
    async usdToTenantRate(currency: string): Promise<number | null> {
        const ccy = currency.toUpperCase();
        const ccyRow = await this.ratesRepository.findOne({ where: { currency: ccy } });
        const usdRow = await this.ratesRepository.findOne({ where: { currency: 'USD' } });
        if (!ccyRow?.rate || !usdRow?.rate) return null;
        const rate = ccyRow.rate / usdRow.rate;
        return Number.isFinite(rate) && rate > 0 ? rate : null;
    }

    async backfillRecord(record: BillingRecord, source: FxRateSource = 'backfill'): Promise<void> {
        const totalCost = Number(record.totalCost) || 0;
        if (totalCost <= 0) return;
        if (record.amountCurrency != null && Number(record.amountCurrency) > 0) return;

        const snap = await this.captureSnapshot(totalCost, source);
        await record.update(this.toFxFields(snap));
    }

    async backfillMissingForPeriod(userId: string, periodFrom: string, periodTo: string): Promise<number> {
        const rows = await BillingRecord.findAll({
            where: {
                userId,
                totalCost: { [Op.gt]: 0 },
                amountCurrency: { [Op.is]: null },
                createdAt: {
                    [Op.between]: [`${periodFrom}T00:00:00.000Z`, `${periodTo}T23:59:59.999Z`],
                },
            } as any,
        });

        for (const row of rows) {
            await this.backfillRecord(row, 'backfill_closing');
        }
        if (rows.length > 0) {
            this.logger.log(
                `backfillMissingForPeriod userId=${userId} period=${periodFrom}..${periodTo} count=${rows.length}`,
            );
        }
        return rows.length;
    }

    /** @returns count of rows updated */
    async backfillAllMissing(limit = 5000, userId?: string): Promise<number> {
        const where: Record<string, unknown> = {
            totalCost: { [Op.gt]: 0 },
            amountCurrency: { [Op.is]: null },
        };
        const userIdTrimmed = userId?.trim();
        if (userIdTrimmed) {
            where.userId = userIdTrimmed;
        }

        const rows = await BillingRecord.findAll({
            where: where as any,
            limit,
            order: [['createdAt', 'ASC']],
        });
        for (const row of rows) {
            await this.backfillRecord(row, 'backfill');
        }
        return rows.length;
    }

    shouldUseAmountCurrencyClosing(): boolean {
        return isRubTenant();
    }
}
