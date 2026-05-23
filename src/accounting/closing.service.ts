import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize, Op } from 'sequelize';
import { randomUUID } from 'node:crypto';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyService } from '../currency/currency.service';
import { DocumentCounterService } from './document-counter.service';
import {
    buildClosingDocumentNote,
    resolveClosingUpdSubject,
    UPD_NUMBER_PENDING,
} from './billing.constants';
import { SbisService } from './sbis.service';
import type { SbisUpdDraftInput } from './sbis.types';
import { CurrencyHistory } from './currency-history.model';
import { BillingFxService } from '../billing/billing-fx.service';
import { isRubTenant } from '../shared/tenant/tenant-currency';
import { isInvoiceBillingEnabled } from '../shared/tenant/invoice-billing-context';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';
import { OrganizationEdoService } from '../organizations/organization-edo.service';
import { User } from '../users/users.model';
import { OurOrganization } from '../our-organizations/our-organization.model';
import { ensureOwnerPersonalAccount } from '../users/personal-account.util';
import { extractOrganizationDocumentId } from './document-id.util';
import { buildChetopBuyerFromOrganization, buildChetopSellerFromIssuer } from './sbis-invoice-party';
import { previousCalendarMonthPeriod, todayCalendarDateLocal } from '../shared/date/calendar-date';

export interface CloseForOrganizationOptions {
    periodFrom: string;
    periodTo: string;
    documentDate?: string;
    sendViaEdo?: boolean;
    dryRun?: boolean;
}

export interface CloseForOrganizationResult {
    dryRun?: boolean;
    organizationId: number;
    periodFrom: string;
    periodTo: string;
    amountRub: number;
    amountUsd: number;
    fxRate: string;
    skipped: boolean;
    skipReason?: string;
    subject?: string;
    note?: string;
    documentId?: string;
    number?: string;
    sbisId?: string;
    sbisNumber?: string;
    edoSent?: boolean;
    error?: string;
}

@Injectable()
export class ClosingService {
    private readonly logger = new Logger(ClosingService.name);

    constructor(
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        @InjectModel(BillingRecord) private readonly billingModel: typeof BillingRecord,
        @InjectModel(CurrencyHistory) private readonly currencyHistory: typeof CurrencyHistory,
        @InjectModel(User) private readonly userModel: typeof User,
        private readonly currency: CurrencyService,
        private readonly counters: DocumentCounterService,
        private readonly sbis: SbisService,
        private readonly billingFx: BillingFxService,
        private readonly ourOrganizationsService: OurOrganizationsService,
        private readonly organizationEdo: OrganizationEdoService,
        @InjectConnection() private readonly sequelize: Sequelize,
    ) {}

    isClosingEnabled(): boolean {
        return isRubTenant() && isInvoiceBillingEnabled();
    }

    defaultPreviousMonthPeriod(): { periodFrom: string; periodTo: string } {
        return previousCalendarMonthPeriod();
    }

    async runMonthlyClosing(): Promise<void> {
        if (!this.isClosingEnabled()) {
            this.logger.log('runMonthlyClosing: skipped (not RUB tenant or invoice billing disabled)');
            return;
        }
        const { periodFrom, periodTo } = this.defaultPreviousMonthPeriod();
        const documentDate = todayCalendarDateLocal();
        const sendViaEdo = process.env.CLOSING_AUTO_SEND_EDO !== 'false';

        const orgs = await this.orgModel.findAll();
        for (const org of orgs) {
            try {
                await this.closeForOrganization(org, {
                    periodFrom,
                    periodTo,
                    documentDate,
                    sendViaEdo,
                });
            } catch (e) {
                this.logger.error(`closing failed for org ${org.id}: ${(e as Error).message}`);
            }
        }
    }

    async closeForOrganization(
        org: Organization,
        options: CloseForOrganizationOptions,
    ): Promise<CloseForOrganizationResult> {
        const { periodFrom, periodTo } = options;
        const documentDate = options.documentDate || todayCalendarDateLocal();
        const fxDate = documentDate;

        const base: CloseForOrganizationResult = {
            organizationId: org.id,
            periodFrom,
            periodTo,
            amountRub: 0,
            amountUsd: 0,
            fxRate: '0',
            skipped: true,
        };

        if (!this.isClosingEnabled()) {
            return { ...base, skipReason: 'closing_not_enabled' };
        }

        const existingUpd = await this.docModel.findOne({
            where: {
                organizationId: org.id,
                type: 'upd',
                periodFrom,
                periodTo,
            },
        });
        if (existingUpd && !options.dryRun) {
            return {
                ...base,
                skipped: false,
                documentId: extractOrganizationDocumentId(existingUpd.id) || String(existingUpd.id),
                sbisId: existingUpd.sbisId || undefined,
                amountRub: Number(existingUpd.amountRub || 0),
                amountUsd: Number(existingUpd.amountUsd || 0),
                fxRate: existingUpd.fxRate || '0',
                skipReason: 'already_exists',
            };
        }

        const userIdStr = String(org.userId);
        const periodWhere = {
            userId: userIdStr,
            createdAt: { [Op.between]: [`${periodFrom}T00:00:00.000Z`, `${periodTo}T23:59:59.999Z`] },
        } as Record<string, unknown>;

        if (isRubTenant()) {
            await this.billingFx.backfillMissingForPeriod(userIdStr, periodFrom, periodTo);
        }

        const usageUsdRaw = await this.billingModel.sum('totalCost', { where: periodWhere });
        const usageUsd = Number(usageUsdRaw || 0);
        if (usageUsd <= 0) {
            return { ...base, skipReason: 'zero_usage' };
        }

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

        const personalAccountNumber = await ensureOwnerPersonalAccount(this.userModel, org.userId);
        const subject = resolveClosingUpdSubject();
        const note = buildClosingDocumentNote(personalAccountNumber, periodFrom, periodTo);

        if (options.dryRun) {
            return {
                organizationId: org.id,
                periodFrom,
                periodTo,
                amountRub,
                amountUsd: usageUsd,
                fxRate,
                skipped: false,
                dryRun: true,
                subject,
                note,
            };
        }

        if (!this.sbis.isConfigured()) {
            return {
                ...base,
                amountRub,
                amountUsd: usageUsd,
                fxRate,
                skipped: true,
                skipReason: 'sbis_not_configured',
                subject,
                note,
            };
        }

        const issuerOrg = await this.resolveIssuerForTenant(org.userId);
        const series = this.counters.defaultSeries();
        const vatMode = (process.env.SBIS_VAT_MODE || 'none').trim() || 'none';
        const documentId = randomUUID();

        const stableDocId = await this.sequelize.transaction(async (transaction) => {
            const docRow = await this.docModel.create(
                {
                    id: documentId,
                    userId: userIdStr,
                    organizationId: org.id,
                    type: 'upd',
                    number: UPD_NUMBER_PENDING,
                    series,
                    documentDate,
                    periodFrom,
                    periodTo,
                    amountRub: amountRub.toFixed(2),
                    amountUsd: amountUsdStr,
                    fxRate,
                    vatMode,
                    vatAmount: '0',
                    status: 'issued',
                    subject,
                    relatedAdvanceInvoiceIds: null,
                } as Parameters<typeof this.docModel.create>[0],
                { transaction },
            );

            return extractOrganizationDocumentId(docRow.getDataValue('id') ?? docRow.id) || documentId;
        });

        const chetopSeller = buildChetopSellerFromIssuer(issuerOrg);
        const draftInput: SbisUpdDraftInput = {
            counterpartyInn: org.tin,
            counterpartyName: org.name,
            counterpartyKpp: org.kpp,
            legalForm: (org.legalForm as 'ul' | 'ip') || undefined,
            ourOrganizationInn: issuerOrg.tin,
            ourOrganizationKpp: issuerOrg.kpp,
            documentDate,
            periodFrom,
            periodTo,
            amountRub,
            subject,
            note,
            personalAccountNumber,
            seller: chetopSeller,
            buyer: buildChetopBuyerFromOrganization(org, chetopSeller.bank),
        };

        const sendViaEdo = Boolean(options.sendViaEdo);
        this.enqueueUpdSbisPhases(stableDocId, draftInput, issuerOrg, org, sendViaEdo);

        return {
            organizationId: org.id,
            periodFrom,
            periodTo,
            amountRub,
            amountUsd: usageUsd,
            fxRate,
            skipped: false,
            subject,
            note,
            documentId: stableDocId,
            number: UPD_NUMBER_PENDING,
        };
    }

    private enqueueUpdSbisPhases(
        docId: string,
        draftInput: SbisUpdDraftInput,
        issuerOrg: OurOrganization,
        org: Organization,
        sendViaEdo: boolean,
    ): void {
        void (async () => {
            try {
                const draft = await this.sbis.createUpdDraft(draftInput);
                const displayNumber = (draft.sbisNumber || '').trim() || UPD_NUMBER_PENDING;
                let sbisStatus = 'draft';
                let sbisLastError: string | null = null;
                if (sendViaEdo) {
                    try {
                        this.organizationEdo.assertEdoReady(org);
                        const thumbprint = issuerOrg.sbisCertThumbprint?.trim() || null;
                        if (!thumbprint) {
                            sbisLastError = 'Issuer certificate thumbprint is not configured';
                            this.logger.warn(`UPD ${docId}: EDO skipped — no thumbprint`);
                        } else {
                            const sent = await this.sbis.sendDocumentToEdo(draft.documentId, draft.revisionId, {
                                certThumbprint: thumbprint,
                            });
                            sbisStatus = 'sent_to_sbis';
                            this.logger.log(
                                `UPD ${docId} sent to EDO: ${sent.stateName || sent.stateCode || 'ok'}`,
                            );
                        }
                    } catch (edoErr) {
                        const msg = (edoErr as Error).message;
                        sbisLastError = msg.slice(0, 500);
                        this.logger.warn(`UPD ${docId}: EDO not sent — ${msg}`);
                    }
                }

                await this.docModel.update(
                    {
                        number: displayNumber,
                        sbisId: draft.documentId,
                        sbisUrl: draft.sbisUrl,
                        sbisDocNum: draft.sbisNumber,
                        sbisStatus,
                        sbisLastError,
                        pdfPath: null,
                    },
                    { where: { id: docId } },
                );
            } catch (e) {
                const message = (e as Error).message;
                this.logger.warn(`SBIS UPD draft failed for ${docId}: ${message}`);
                const row = await this.docModel.findByPk(docId, { attributes: ['sbisAttemptCount'] });
                await this.docModel.update(
                    {
                        sbisLastError: message.slice(0, 500),
                        sbisAttemptCount: (row?.sbisAttemptCount ?? 0) + 1,
                        sbisStatus: 'failed',
                    },
                    { where: { id: docId } },
                );
            }
        })();
    }

    private async resolveIssuerForTenant(userId: number): Promise<OurOrganization> {
        const user = await this.userModel.findByPk(userId, {
            attributes: ['id', 'ourOrganizationId', 'vpbx_user_id'],
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        const ownerId = user.vpbx_user_id ?? user.id;
        const owner = user.vpbx_user_id
            ? await this.userModel.findByPk(ownerId, { attributes: ['id', 'ourOrganizationId'] })
            : user;
        return this.ourOrganizationsService.resolveIssuerForTenant(owner?.ourOrganizationId ?? null);
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
            } as Parameters<typeof this.currencyHistory.create>[0])
            .catch(() => undefined);
        return rate;
    }
}
