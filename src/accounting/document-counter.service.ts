import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize, Transaction } from 'sequelize';
import { DocumentCounter } from './document-counter.model';
import { DOCUMENT_SERIES_DEFAULT } from './billing.constants';

/** 1..366 (365), local calendar date of `date`. */
export function getDayOfYear(date: Date = new Date()): number {
    const start = new Date(date.getFullYear(), 0, 0);
    return Math.floor((date.getTime() - start.getTime()) / 86_400_000);
}

@Injectable()
export class DocumentCounterService {
    constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

    async nextNumber(docType: string, year: number, transaction?: Transaction): Promise<number> {
        const run = async (t: Transaction) => {
            const row = await DocumentCounter.findOne({
                where: { year, docType },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!row) {
                const created = await DocumentCounter.create(
                    { year, docType, lastNumber: 1 },
                    { transaction: t },
                );
                return created.lastNumber;
            }
            await row.increment('lastNumber', { transaction: t });
            await row.reload({ transaction: t });
            return row.lastNumber;
        };

        if (transaction) {
            return run(transaction);
        }
        return this.sequelize.transaction((t) => run(t));
    }

    formatDocumentNumber(series: string, typeCode: string, year: number, seq: number): string {
        const padded = String(seq).padStart(6, '0');
        return `${series}-${typeCode}-${year}-${padded}`;
    }

    invoiceCounterDocType(dayOfYear: number): string {
        return `invoice-d${dayOfYear}`;
    }

    /**
     * Payment invoice: {prefix}-{numeric}, one number = 3-digit day-of-year + daily seq (no separator).
     * e.g. day 142 #3 → 01423; day 360 #262 → 360262 (leading zeros only if INVOICE_NUMBER_MIN_WIDTH not reached).
     */
    formatInvoiceNumber(seq: number, dayOfYear: number): string {
        const prefix = (process.env.INVOICE_NUMBER_PREFIX || 'AIPBX').trim() || 'AIPBX';
        const minWidth = Number(process.env.INVOICE_NUMBER_MIN_WIDTH || process.env.INVOICE_NUMBER_PAD || 5);
        const min = Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 5;
        const body = `${String(dayOfYear).padStart(3, '0')}${seq}`;
        const numeric = body.length < min ? body.padStart(min, '0') : body;
        return `${prefix}-${numeric}`;
    }

    defaultSeries(): string {
        return process.env.DOCUMENT_SERIES || DOCUMENT_SERIES_DEFAULT;
    }
}
