import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize, Op } from 'sequelize';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyService } from '../currency/currency.service';
import { DocumentCounterService } from './document-counter.service';
import { DOC_TYPE_ACT, DOC_TYPE_SF } from './billing.constants';
import { renderActPdfToFile } from './pdf/act-pdf';
import { renderSfPdfToFile } from './pdf/sf-pdf';
import { SbisService } from './sbis.service';
import { CurrencyHistory } from './currency-history.model';
import { BillingFxService } from '../billing/billing-fx.service';
import { isRubTenant } from '../shared/tenant/tenant-currency';

@Injectable()
export class ClosingTask {
    private readonly logger = new Logger(ClosingTask.name);

    constructor(
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        @InjectModel(BillingRecord) private readonly billingModel: typeof BillingRecord,
        @InjectModel(CurrencyHistory) private readonly currencyHistory: typeof CurrencyHistory,
        private readonly currency: CurrencyService,
        private readonly counters: DocumentCounterService,
        private readonly sbis: SbisService,
        private readonly billingFx: BillingFxService,
        @InjectConnection() private readonly sequelize: Sequelize,
    ) {}

    @Cron('0 3 1 * *')
    async monthlyClosingDocuments(): Promise<void> {
        this.logger.log('monthlyClosingDocuments: start');
        const now = new Date();
        const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
        const periodFrom = prevMonthStart.toISOString().slice(0, 10);
        const periodTo = prevMonthEnd.toISOString().slice(0, 10);
        const fxDate = now.toISOString().slice(0, 10);

        const orgs = await this.orgModel.findAll();
        for (const org of orgs) {
            try {
                await this.closeForOrganization(org, periodFrom, periodTo, fxDate);
            } catch (e) {
                this.logger.error(`closing failed for org ${org.id}: ${(e as Error).message}`);
            }
        }
        this.logger.log('monthlyClosingDocuments: done');
    }

    private async closeForOrganization(
        org: Organization,
        periodFrom: string,
        periodTo: string,
        fxDate: string,
    ): Promise<void> {
        const userIdStr = String(org.userId);
        const existingAct = await this.docModel.findOne({
            where: {
                organizationId: org.id,
                type: 'act',
                periodFrom,
                periodTo,
            },
        });
        if (existingAct) return;

        const periodWhere = {
            userId: userIdStr,
            createdAt: { [Op.between]: [`${periodFrom}T00:00:00.000Z`, `${periodTo}T23:59:59.999Z`] },
        } as any;

        if (isRubTenant()) {
            await this.billingFx.backfillMissingForPeriod(userIdStr, periodFrom, periodTo);
        }

        const usageUsdRaw = await this.billingModel.sum('totalCost', { where: periodWhere });
        const usageUsd = Number(usageUsdRaw || 0);
        if (usageUsd <= 0) return;

        const amountUsdStr = usageUsd.toFixed(4);
        let amountRub: number;
        let fxRate: string;

        if (isRubTenant()) {
            const usageRubRaw = await this.billingModel.sum('amountCurrency', { where: periodWhere });
            const usageRub = Number(usageRubRaw || 0);
            amountRub = Math.round(usageRub * 100) / 100;
            fxRate = usageUsd > 0 ? (usageRub / usageUsd).toFixed(6) : (await this.rubPerUsd(fxDate)).toFixed(6);
        } else {
            const rubPerUsd = await this.rubPerUsd(fxDate);
            amountRub = Math.round(usageUsd * rubPerUsd * 100) / 100;
            fxRate = rubPerUsd.toFixed(6);
        }

        const advances = await this.docModel.findAll({
            where: {
                organizationId: org.id,
                type: 'advance_invoice',
                documentDate: { [Op.between]: [periodFrom, periodTo] },
            },
        });
        const advanceIds = advances.map((a) => a.id);

        const year = new Date(fxDate).getFullYear();
        const series = this.counters.defaultSeries();
        const vatMode = (process.env.SBIS_VAT_MODE || 'none').trim() || 'none';

        await this.sequelize.transaction(async (transaction) => {
            const seqAct = await this.counters.nextNumber('act', year, transaction);
            const actNumber = this.counters.formatDocumentNumber(series, DOC_TYPE_ACT, year, seqAct);
            const seqSf = await this.counters.nextNumber('sf', year, transaction);
            const sfNumber = this.counters.formatDocumentNumber(series, DOC_TYPE_SF, year, seqSf);

            const subject = org.subject?.trim() || (process.env.SBIS_AIPBX_SUBJECT_DEFAULT || '').trim() || '';

            const act = await this.docModel.create(
                {
                    userId: userIdStr,
                    organizationId: org.id,
                    type: 'act',
                    number: actNumber,
                    series,
                    documentDate: fxDate,
                    periodFrom,
                    periodTo,
                    amountRub: amountRub.toFixed(2),
                    amountUsd: amountUsdStr,
                    fxRate,
                    vatMode,
                    vatAmount: '0',
                    status: 'issued',
                    subject: subject || 'Услуги AI PBX',
                    relatedAdvanceInvoiceIds: advanceIds.length ? advanceIds : null,
                } as any,
                { transaction },
            );

            const sf = await this.docModel.create(
                {
                    userId: userIdStr,
                    organizationId: org.id,
                    type: 'sf',
                    number: sfNumber,
                    series,
                    documentDate: fxDate,
                    periodFrom,
                    periodTo,
                    amountRub: amountRub.toFixed(2),
                    amountUsd: amountUsdStr,
                    fxRate,
                    vatMode,
                    vatAmount: '0',
                    status: 'issued',
                    subject: subject || 'Услуги AI PBX',
                    relatedAdvanceInvoiceIds: advanceIds.length ? advanceIds : null,
                } as any,
                { transaction },
            );

            const actPdf = await renderActPdfToFile(
                {
                    number: actNumber,
                    documentDate: fxDate,
                    periodFrom,
                    periodTo,
                    amountRub,
                    subject: act.subject,
                    customerName: org.name,
                },
                `${act.id}.pdf`,
            );
            const sfPdf = await renderSfPdfToFile(
                {
                    number: sfNumber,
                    documentDate: fxDate,
                    amountRub,
                    subject: sf.subject,
                    customerName: org.name,
                    advance: false,
                },
                `${sf.id}.pdf`,
            );

            await act.update({ pdfPath: actPdf }, { transaction });
            await sf.update({ pdfPath: sfPdf }, { transaction });
        });

        setImmediate(() => {
            void this.sbis.enqueueDocument('act', { orgId: org.id, periodFrom, periodTo });
        });
    }

    private async rubPerUsd(atDate: string): Promise<number> {
        const cached = await this.currencyHistory.findOne({
            where: { atDate, fromCurrency: 'USD', toCurrency: 'RUB' },
        });
        if (cached) return Number(cached.rate);

        const oneUsdInRub = 1 / (await this.currency.convertToUsd(1, 'RUB'));
        const rate = Number.isFinite(oneUsdInRub) && oneUsdInRub > 0 ? oneUsdInRub : 90;
        await this.currencyHistory
            .create({
                atDate,
                fromCurrency: 'USD',
                toCurrency: 'RUB',
                rate: rate.toFixed(8),
            } as any)
            .catch(() => undefined);
        return rate;
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async retryFailedSbis(): Promise<void> {
        const docs = await this.docModel.findAll({
            where: {
                status: 'failed',
                sbisAttemptCount: { [Op.lt]: 6 },
            },
            limit: 20,
        });
        for (const d of docs) {
            const r = await this.sbis.enqueueDocument(d.type, { id: d.id });
            const next = d.sbisAttemptCount + 1;
            if (r.ok) {
                await d.update({ status: 'sent_to_sbis', sbisAttemptCount: next });
            } else {
                await d.update({
                    sbisAttemptCount: next,
                    sbisLastError: r.detail || 'retry',
                    status: next >= 6 ? 'failed' : 'failed',
                });
            }
        }
    }
}
