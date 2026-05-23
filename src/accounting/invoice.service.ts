import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { DocumentCounterService, getDayOfYear } from './document-counter.service';
import { formatInvoiceLineItemSubject, resolveInvoiceSubject } from './subject-resolver';
import { DOC_TYPE_INVOICE } from './billing.constants';
import { renderInvoicePdfToFile, type InvoiceIssuerRequisites } from './pdf/invoice-pdf';
import { AlfawebhookClient } from './alfawebhook-client.service';
import { extractOrganizationDocumentId } from './document-id.util';
import { SbisService } from './sbis.service';
import type { SbisInvoiceDraftInput } from './sbis.types';
import { buildChetopBuyerFromOrganization, buildChetopSellerFromIssuer } from './sbis-invoice-party';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';
import { OrganizationEdoService } from '../organizations/organization-edo.service';
import { User } from '../users/users.model';
import { OurOrganization } from '../our-organizations/our-organization.model';
import { buildInvoicePaymentPurpose, ensureOwnerPersonalAccount } from '../users/personal-account.util';
import {
    isInvoiceBillingEnabled,
    isInvoiceBillingHostAllowed,
} from '../shared/tenant/invoice-billing-context';

export interface CreateInvoiceInput {
    userId: number;
    organizationId: number;
    amountRub: number;
    subjectOverride?: string | null;
    /** Admin override: issuer legal entity for this invoice */
    ourOrganizationId?: number | null;
    /** Create draft in SBIS (EDO); otherwise local PDF only */
    sendViaEdo?: boolean;
}

@Injectable()
export class InvoiceService {
    private readonly logger = new Logger(InvoiceService.name);

    constructor(
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        private readonly counters: DocumentCounterService,
        private readonly alfawebhook: AlfawebhookClient,
        private readonly sbis: SbisService,
        private readonly ourOrganizationsService: OurOrganizationsService,
        private readonly organizationEdo: OrganizationEdoService,
        @InjectModel(User) private readonly userModel: typeof User,
        @InjectConnection() private readonly sequelize: Sequelize,
    ) {}

    getPublicDefaultSubject(): string {
        return resolveInvoiceSubject({
            envDefault: this.getDefaultSubjectFromEnv() || null,
        });
    }

    /**
     * HTTP requests: Host / X-Forwarded-Host must match INVOICE_BILLING_ALLOWED_HOSTS.
     * Server-side invoices (balance alerts): no Host header — allowed when
     * INVOICE_BILLING_DEFAULT_HOST is unset; if set, that host is checked against the allowlist.
     */
    isHostAllowedForRuBilling(hostHeader?: string): boolean {
        return isInvoiceBillingHostAllowed(hostHeader);
    }

    getDefaultSubjectFromEnv(): string {
        return (process.env.SBIS_AIPBX_SUBJECT_DEFAULT || '').trim();
    }

    async issueInvoice(
        input: CreateInvoiceInput,
        hostHeader?: string,
    ): Promise<{
        documentId: string;
        number: string;
        pdfUrl: string;
        pdfRelativePath: string;
        paymentPurpose: string;
        subject: string;
    }> {
        if (!isInvoiceBillingEnabled()) {
            throw new HttpException('Invoice billing is not enabled for this deployment', HttpStatus.FORBIDDEN);
        }
        if (!this.isHostAllowedForRuBilling(hostHeader)) {
            throw new HttpException('Invoice billing is not enabled for this host', HttpStatus.FORBIDDEN);
        }
        if (!input.amountRub || input.amountRub <= 0) {
            throw new HttpException('amountRub must be positive', HttpStatus.BAD_REQUEST);
        }

        const org = await this.orgModel.findOne({
            where: { id: input.organizationId, userId: input.userId },
        });
        if (!org) {
            throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
        }

        const subject = resolveInvoiceSubject({
            bodySubject: input.subjectOverride,
            organizationSubject: org.subject,
            envDefault: this.getDefaultSubjectFromEnv() || null,
        });
        const personalAccountNumber = await ensureOwnerPersonalAccount(this.userModel, input.userId);
        const lineItemSubject = formatInvoiceLineItemSubject(subject, personalAccountNumber);

        const issuerOrg = await this.resolveIssuer(input);
        const issuerRequisites = this.buildIssuerRequisitesForPdf(issuerOrg);
        if (input.sendViaEdo && !this.sbis.isConfigured()) {
            throw new HttpException(
                'SBIS is not configured; cannot send invoice via EDO',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
        if (input.sendViaEdo) {
            this.organizationEdo.assertEdoReady(org);
        }

        const issuedAt = new Date();
        const year = issuedAt.getFullYear();
        const dayOfYear = getDayOfYear(issuedAt);
        const series = this.counters.defaultSeries();

        const chetopSeller = buildChetopSellerFromIssuer(issuerOrg);

        const { docId, number, paymentPurpose, documentDate, sbisDraft, pdfRelativePath } =
            await this.sequelize.transaction(async (transaction) => {
            const seq = await this.counters.nextNumber(
                this.counters.invoiceCounterDocType(dayOfYear),
                year,
                transaction,
            );
            const numberInner = this.counters.formatInvoiceNumber(seq, dayOfYear);
            const documentDateInner = issuedAt.toISOString().slice(0, 10);
            const paymentPurposeInner = buildInvoicePaymentPurpose(
                numberInner,
                documentDateInner,
                personalAccountNumber,
            );

            const vatMode = (process.env.SBIS_VAT_MODE || 'none').trim() || 'none';
            const idempotencyKey = `inv:${input.organizationId}:${numberInner}`;

            /** App-generated PK: MySQL often does not return `UUID()` into the Sequelize instance after INSERT. */
            const documentId = randomUUID();

            const docRow = await this.docModel.create(
                {
                    id: documentId,
                    userId: String(input.userId),
                    organizationId: org.id,
                    type: 'invoice',
                    number: numberInner,
                    series,
                    documentDate: documentDateInner,
                    amountRub: input.amountRub.toFixed(2),
                    vatMode,
                    vatAmount: '0',
                    status: 'issued',
                    subject: lineItemSubject,
                    idempotencyKey,
                },
                { transaction },
            );

            const stableDocId =
                extractOrganizationDocumentId(docRow.getDataValue('id') ?? docRow.id) || documentId;

            const fileName = `${stableDocId}.pdf`;
            const relativePath = await renderInvoicePdfToFile(
                {
                    number: numberInner,
                    documentDate: documentDateInner,
                    amountRub: input.amountRub,
                    subject: lineItemSubject,
                    paymentPurpose: paymentPurposeInner,
                    payer: org,
                    issuer: issuerRequisites,
                },
                fileName,
            );
            await docRow.update({ pdfPath: relativePath }, { transaction });

            return {
                docId: stableDocId,
                number: numberInner,
                paymentPurpose: paymentPurposeInner,
                documentDate: documentDateInner,
                pdfRelativePath: relativePath,
                sbisDraft:
                    input.sendViaEdo
                        ? {
                              counterpartyInn: org.tin,
                              counterpartyName: org.name,
                              counterpartyKpp: org.kpp,
                              legalForm: (org.legalForm as 'ul' | 'ip') || undefined,
                              ourOrganizationInn: issuerOrg.tin,
                              ourOrganizationKpp: issuerOrg.kpp,
                              number: numberInner,
                              documentDate: documentDateInner,
                              amountRub: input.amountRub,
                              subject: lineItemSubject,
                              paymentPurpose: paymentPurposeInner,
                              seller: chetopSeller,
                              buyer: buildChetopBuyerFromOrganization(org, chetopSeller.bank),
                              personalAccountNumber,
                          }
                        : null,
            };
        });

        if (sbisDraft) {
            this.enqueueInvoiceSbisDraft(docId, sbisDraft, issuerOrg);
        }

        try {
            await this.alfawebhook.ensureClientRegistered(org, String(input.userId), subject);
            if (!org.alfawebhookSyncedAt) {
                await org.update({ alfawebhookSyncedAt: new Date() });
            }
        } catch (e) {
            this.logger.warn(`alfawebhook onboarding failed: ${(e as Error).message}`);
        }

        // Path without `/api` — фронт склеивает с `__API__`, где уже есть суффикс `/api`.
        const pdfUrl = `/organizations/${org.id}/documents/${docId}/pdf`;
        return {
            documentId: docId,
            number,
            pdfUrl,
            pdfRelativePath,
            paymentPurpose,
            subject: lineItemSubject,
        };
    }

    private async resolveIssuer(input: CreateInvoiceInput): Promise<OurOrganization> {
        if (input.ourOrganizationId != null) {
            const forced = await this.ourOrganizationsService.findById(input.ourOrganizationId);
            if (!forced) {
                throw new HttpException('Our organization not found', HttpStatus.BAD_REQUEST);
            }
            return forced;
        }
        return this.resolveIssuerForTenant(input.userId);
    }

    /** Tenant owner `ourOrganizationId` → our_organizations row (or primary if unset). */
    private async resolveIssuerForTenant(userId: number): Promise<OurOrganization> {
        const user = await this.userModel.findByPk(userId, { attributes: ['id', 'ourOrganizationId', 'vpbx_user_id'] });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        const ownerId = user.vpbx_user_id ?? user.id;
        const owner = user.vpbx_user_id
            ? await this.userModel.findByPk(ownerId, { attributes: ['id', 'ourOrganizationId'] })
            : user;
        return this.ourOrganizationsService.resolveIssuerForTenant(owner?.ourOrganizationId ?? null);
    }

    /** SBIS draft after HTTP response; local PDF is already stored. */
    private enqueueInvoiceSbisDraft(
        docId: string,
        draftInput: SbisInvoiceDraftInput,
        issuerOrg: OurOrganization,
    ): void {
        void (async () => {
            try {
                const draft = await this.sbis.createInvoiceDraft(draftInput);
                let sbisStatus: string = 'draft';
                let sbisLastError: string | null = null;
                if (this.sbis.edoAutoSendEnabled()) {
                    const thumbprint = issuerOrg?.sbisCertThumbprint?.trim() || null;
                    if (!thumbprint) {
                        sbisLastError = 'Issuer certificate thumbprint is not configured';
                        sbisStatus = 'failed';
                    } else {
                    try {
                        const sent = await this.sbis.sendInvoiceToEdo(draft, {
                            certThumbprint: thumbprint,
                        });
                        if (this.sbis.isEdoAwaitingOwnerSignature(sent.stateCode, sent.stateName)) {
                            sbisStatus = 'awaiting_signature';
                            this.logger.log(
                                `SBIS invoice ${docId} queued for owner signature in Saby: ${sent.stateName || sent.stateCode}`,
                            );
                        } else {
                            sbisStatus = 'sent_to_sbis';
                            this.logger.log(
                                `SBIS invoice ${docId} sent to EDO: ${sent.stateName || sent.stateCode || 'ok'}`,
                            );
                        }
                    } catch (sendErr) {
                        const msg = (sendErr as Error).message;
                        sbisLastError = msg.slice(0, 500);
                        sbisStatus = 'failed';
                        this.logger.warn(`SBIS EDO send failed for ${docId}: ${msg}`);
                    }
                    }
                }
                await this.docModel.update(
                    {
                        sbisId: draft.documentId,
                        sbisUrl: draft.sbisUrl,
                        sbisDocNum: draft.sbisNumber,
                        sbisStatus,
                        sbisLastError,
                    },
                    { where: { id: docId } },
                );
            } catch (e) {
                const message = (e as Error).message;
                this.logger.warn(`SBIS invoice draft failed for ${docId}: ${message}`);
                const row = await this.docModel.findByPk(docId, { attributes: ['sbisAttemptCount'] });
                await this.docModel.update(
                    {
                        sbisLastError: message.slice(0, 500),
                        sbisAttemptCount: (row?.sbisAttemptCount ?? 0) + 1,
                    },
                    { where: { id: docId } },
                );
            }
        })();
    }

    private buildIssuerRequisitesForPdf(org: OurOrganization): InvoiceIssuerRequisites {
        const bankBranch = (org.bankBranchName || '').trim() || (org.bankName || '').trim();
        const supplierParts = [
            org.name,
            org.tin ? `ИНН ${org.tin}` : '',
            org.kpp ? `КПП ${org.kpp}` : '',
            org.address,
        ].filter(Boolean);
        return {
            bankBranchName: bankBranch,
            bic: org.bankBic || '',
            correspondentAccount: org.bankCorrAccount || '',
            inn: org.tin,
            kpp: org.kpp || '',
            settlementAccount: org.bankAccount || '',
            recipientShortName: org.name,
            supplierLineBold: supplierParts.join(', '),
        };
    }

    /**
     * USN: no advance SF — mark matching invoice paid when bank payment is identified.
     */
    async createAdvanceAfterBankPayment(input: {
        userId: number;
        amountRub: number;
        paymentId: string;
        externalTransactionId: string;
        transaction: import('sequelize').Transaction;
    }): Promise<OrganizationDocument | null> {
        const amountStr = input.amountRub.toFixed(2);
        const inv = await this.docModel.findOne({
            where: {
                userId: String(input.userId),
                type: 'invoice',
                status: 'issued',
                amountRub: amountStr,
            },
            order: [['createdAt', 'DESC']],
            transaction: input.transaction,
        });

        if (inv) {
            await inv.update({ status: 'paid' }, { transaction: input.transaction });
        }

        return null;
    }
}
