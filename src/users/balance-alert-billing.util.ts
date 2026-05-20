import { Op } from 'sequelize';
import type { BillingRecord } from '../billing/billing-record.model';
import type { CurrencyService } from '../currency/currency.service';

/** Round up to nearest 50 RUB (120 -> 150, 160 -> 200). */
export function roundUpToNearest50Rub(amount: number): number {
    if (!Number.isFinite(amount) || amount <= 0) {
        return 50;
    }
    return Math.ceil(amount / 50) * 50;
}

export async function sumTenantSpendLast30DaysRub(
    billingRecordRepository: typeof BillingRecord,
    currencyService: CurrencyService,
    ownerUserId: number,
    memberUserIds: string[],
): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ids = memberUserIds.length ? memberUserIds : [String(ownerUserId)];

    const rows = await billingRecordRepository.findAll({
        where: {
            userId: { [Op.in]: ids },
            createdAt: { [Op.gte]: since },
        },
        attributes: ['totalCost', 'amountCurrency', 'currency'],
    });

    let sumRub = 0;
    for (const row of rows) {
        const amountCurrency = row.amountCurrency != null ? Number(row.amountCurrency) : null;
        const currency = (row.currency || '').toUpperCase();
        if (amountCurrency != null && Number.isFinite(amountCurrency) && currency === 'RUB') {
            sumRub += amountCurrency;
            continue;
        }
        const usd = Number(row.totalCost) || 0;
        if (usd <= 0) continue;
        const converted = await currencyService.convertFromUsd(usd, 'RUB');
        sumRub += converted.amount;
    }

    return sumRub;
}
