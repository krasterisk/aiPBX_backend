import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/sequelize';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { DocumentCounterService } from './document-counter.service';
import { resolveInvoiceSubject } from './subject-resolver';
import { DOC_TYPE_INVOICE, DOC_TYPE_ADVANCE_SF } from './billing.constants';
import { renderInvoicePdfToFile, type InvoiceIssuerRequisites } from './pdf/invoice-pdf';
import { AlfawebhookClient } from './alfawebhook-client.service';
import { extractOrganizationDocumentId } from './document-id.util';

export interface CreateInvoiceInput {
    userId: number;
    organizationId: number;
    amountRub: number;
    subjectOverride?: string | null;
}

@Injectable()
export class InvoiceService {
    private readonly logger = new Logger(InvoiceService.name);

    constructor(
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        private readonly counters: DocumentCounterService,
        private readonly alfawebhook: AlfawebhookClient,
        @InjectConnection() private readonly sequelize: Sequelize,
    ) {}

    getPublicDefaultSubject(): string {
        return resolveInvoiceSubject({
            envDefault: this.getDefaultSubjectFromEnv() || null,
        });
    }

    isHostAllowedForRuBilling(hostHeader?: string): boolean {
        const raw = process.env.INVOICE_BILLING_ALLOWED_HOSTS;
        if (!raw || raw === '*') return true;
        const host = (hostHeader || '').split(':')[0].toLowerCase();
        return raw
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
            .some((h) => host === h || host.endsWith(`.${h}`));
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
        paymentPurpose: string;
        subject: string;
    }> {
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

        const year = new Date().getFullYear();
        const series = this.counters.defaultSeries();

        const { docId, number, paymentPurpose, documentDate } = await this.sequelize.transaction(async (transaction) => {
            const seq = await this.counters.nextNumber('invoice', year, transaction);
            const numberInner = this.counters.formatDocumentNumber(series, DOC_TYPE_INVOICE, year, seq);
            const documentDateInner = new Date().toISOString().slice(0, 10);
            const paymentPurposeInner = `Оплата по счёту №${numberInner} за услуги AI PBX`;

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
                    subject,
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
                    subject,
                    paymentPurpose: paymentPurposeInner,
                    payer: org,
                    issuer: this.buildIssuerRequisitesForPdf(),
                },
                fileName,
            );

            await docRow.update({ pdfPath: relativePath }, { transaction });

            return {
                docId: stableDocId,
                number: numberInner,
                paymentPurpose: paymentPurposeInner,
                documentDate: documentDateInner,
            };
        });

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
            paymentPurpose,
            subject,
        };
    }

    private buildIssuerRequisitesForPdf(): InvoiceIssuerRequisites {
        const name = process.env.SBIS_OUR_NAME || 'AI PBX';
        const inn = process.env.SBIS_OUR_INN || '';
        const kpp = process.env.SBIS_OUR_KPP || '';
        const addr = process.env.SBIS_OUR_ADDRESS || '';
        const bank = process.env.SBIS_OUR_BANK_NAME || process.env.ALFA_BANK_NAME || '';
        const bankBranch = (process.env.SBIS_OUR_BANK_BRANCH_NAME || '').trim() || bank || '—';
        const bic = process.env.SBIS_OUR_BANK_BIC || process.env.ALFA_BANK_BIC || '';
        const settlement = process.env.SBIS_OUR_BANK_ACCOUNT || process.env.ALFA_BANK_ACCOUNT || '';
        const corr = process.env.SBIS_OUR_CORR_ACCOUNT || process.env.ALFA_CORR_ACCOUNT || '';
        const supplierParts = [name, inn ? `ИНН ${inn}` : '', kpp ? `КПП ${kpp}` : '', addr].filter(Boolean);
        return {
            bankBranchName: bankBranch,
            bic,
            correspondentAccount: corr,
            inn,
            kpp,
            settlementAccount: settlement,
            recipientShortName: name,
            supplierLineBold: supplierParts.join(', '),
        };
    }

    /**
     * Creates advance_invoice (авансовая СФ) linked to the latest matching open invoice when possible.
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

        const org = inv
            ? await this.orgModel.findByPk(inv.organizationId, { transaction: input.transaction })
            : await this.orgModel.findOne({
                  where: { userId: input.userId },
                  order: [['id', 'DESC']],
                  transaction: input.transaction,
              });

        if (!org) {
            this.logger.warn(`createAdvanceAfterBankPayment: no organization for user ${input.userId}`);
            return null;
        }

        const subject = resolveInvoiceSubject({
            organizationSubject: org.subject,
            envDefault: this.getDefaultSubjectFromEnv() || null,
        });

        const year = new Date().getFullYear();
        const series = this.counters.defaultSeries();
        const seq = await this.counters.nextNumber('advance_invoice', year, input.transaction);
        const number = this.counters.formatDocumentNumber(series, DOC_TYPE_ADVANCE_SF, year, seq);
        const documentDate = new Date().toISOString().slice(0, 10);
        const vatMode = (process.env.SBIS_VAT_MODE || 'none').trim() || 'none';

        const doc = await this.docModel.create(
            {
                userId: String(input.userId),
                organizationId: org.id,
                type: 'advance_invoice',
                number,
                series,
                documentDate,
                amountRub: amountStr,
                vatMode,
                vatAmount: '0',
                status: 'issued',
                subject,
                paymentId: input.paymentId,
                externalTransactionId: input.externalTransactionId,
                relatedInvoiceId: inv?.id ?? null,
            },
            { transaction: input.transaction },
        );

        const { renderSfPdfToFile } = await import('./pdf/sf-pdf');
        const fileName = `${doc.id}-advance.pdf`;
        const relativePath = await renderSfPdfToFile(
            {
                number,
                documentDate,
                amountRub: input.amountRub,
                subject,
                customerName: org.name,
                advance: true,
            },
            fileName,
        );
        await doc.update({ pdfPath: relativePath }, { transaction: input.transaction });

        if (inv) {
            await inv.update({ status: 'paid' }, { transaction: input.transaction });
        }

        return doc;
    }
}
