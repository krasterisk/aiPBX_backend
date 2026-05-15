import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { SbisService } from './sbis.service';
import { extractOrganizationDocumentId } from './document-id.util';

@Injectable()
export class OrganizationDocumentsService {
    private readonly logger = new Logger(OrganizationDocumentsService.name);

    constructor(
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        private readonly sbis: SbisService,
    ) {}

    private async assertOrgAccess(actingUserId: number, organizationId: number, isAdmin: boolean): Promise<Organization> {
        const org = await this.orgModel.findByPk(organizationId);
        if (!org) {
            throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
        }
        if (!isAdmin && Number(org.userId) !== actingUserId) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }
        return org;
    }

    async listForOrganization(actingUserId: number, organizationId: number, isAdmin: boolean) {
        const org = await this.assertOrgAccess(actingUserId, organizationId, isAdmin);
        const rows = await this.docModel.findAll({
            where: { userId: String(org.userId), organizationId },
            order: [['createdAt', 'DESC']],
            raw: true,
        });
        return rows.map((row) => {
            const r = row as unknown as Record<string, unknown>;
            return {
                ...r,
                id: extractOrganizationDocumentId(r.id),
            };
        });
    }

    async assertPdfAccess(actingUserId: number, organizationId: number, docId: string, isAdmin: boolean) {
        const org = await this.assertOrgAccess(actingUserId, organizationId, isAdmin);
        const doc = await this.docModel.findOne({
            where: { id: docId, userId: String(org.userId), organizationId },
        });
        if (!doc || !doc.pdfPath) {
            throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
        }
        return doc;
    }

    async streamPdf(actingUserId: number, organizationId: number, docId: string, res: Response, isAdmin: boolean) {
        const doc = await this.assertPdfAccess(actingUserId, organizationId, docId, isAdmin);
        const abs = join(process.cwd(), 'static', doc.pdfPath);
        if (!existsSync(abs)) {
            throw new HttpException('PDF file missing', HttpStatus.NOT_FOUND);
        }
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.number}.pdf"`);
        createReadStream(abs).pipe(res);
    }

    async resendToSbis(actingUserId: number, organizationId: number, docId: string, isAdmin: boolean) {
        const org = await this.assertOrgAccess(actingUserId, organizationId, isAdmin);
        const doc = await this.docModel.findOne({
            where: { id: docId, userId: String(org.userId), organizationId },
        });
        if (!doc) {
            throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
        }
        const r = await this.sbis.enqueueDocument(doc.type, { id: doc.id, number: doc.number });
        if (!r.ok) {
            await doc.update({
                status: 'failed',
                sbisLastError: r.detail || 'sbis',
                sbisAttemptCount: doc.sbisAttemptCount + 1,
            });
            throw new HttpException('SBIS enqueue failed', HttpStatus.BAD_GATEWAY);
        }
        await doc.update({
            status: 'sent_to_sbis',
            sbisAttemptCount: doc.sbisAttemptCount + 1,
        });
        return { ok: true };
    }
}
