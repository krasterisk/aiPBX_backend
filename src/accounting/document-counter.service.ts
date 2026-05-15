import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize, Transaction } from 'sequelize';
import { DocumentCounter } from './document-counter.model';
import { DOCUMENT_SERIES_DEFAULT } from './billing.constants';

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

    defaultSeries(): string {
        return process.env.DOCUMENT_SERIES || DOCUMENT_SERIES_DEFAULT;
    }
}
