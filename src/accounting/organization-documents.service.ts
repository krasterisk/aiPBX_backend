import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/sequelize';

import { createReadStream, existsSync, unlink } from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(unlink);

import { join } from 'path';

import { Response } from 'express';

import { Organization } from '../organizations/organizations.model';
import { User } from '../users/users.model';
import { OrganizationDocument } from './organization-document.model';
import { SbisService } from './sbis.service';
import { extractOrganizationDocumentId } from './document-id.util';



@Injectable()

export class OrganizationDocumentsService {

    private readonly logger = new Logger(OrganizationDocumentsService.name);



    constructor(

        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,

        @InjectModel(Organization) private readonly orgModel: typeof Organization,
        @InjectModel(User) private readonly userModel: typeof User,
        private readonly sbis: SbisService,
    ) {}

    private async resolveOwnerUserId(userId: number): Promise<number> {
        const user = await this.userModel.findByPk(userId, {
            attributes: ['id', 'vpbx_user_id'],
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return user.vpbx_user_id ?? user.id;
    }

    private async assertOrgAccess(actingUserId: number, organizationId: number, isAdmin: boolean): Promise<Organization> {
        const org = await this.orgModel.findByPk(organizationId);
        if (!org) {
            throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
        }
        if (!isAdmin) {
            const tenantOwnerId = await this.resolveOwnerUserId(actingUserId);
            if (Number(org.userId) !== tenantOwnerId) {
                throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
            }
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

        if (!doc) {

            throw new HttpException('Document not found', HttpStatus.NOT_FOUND);

        }

        if (!doc.pdfPath && !doc.sbisId) {

            throw new HttpException('PDF not available', HttpStatus.NOT_FOUND);

        }

        return doc;

    }



    async streamPdf(actingUserId: number, organizationId: number, docId: string, res: Response, isAdmin: boolean) {

        const doc = await this.assertPdfAccess(actingUserId, organizationId, docId, isAdmin);



        if (doc.sbisId && this.sbis.isConfigured()) {

            try {

                const pdf = await this.sbis.fetchDocumentPdfBytes(doc.sbisId);

                res.setHeader('Content-Type', 'application/pdf');

                res.setHeader('Content-Disposition', `inline; filename="${doc.number}.pdf"`);

                res.send(pdf);

                return;

            } catch (e) {

                this.logger.warn(`SBIS PDF proxy failed for ${doc.sbisId}: ${(e as Error).message}`);

                if (!doc.pdfPath) {

                    throw new HttpException('SBIS PDF unavailable', HttpStatus.BAD_GATEWAY);

                }

            }

        }



        if (!doc.pdfPath) {

            throw new HttpException('PDF file missing', HttpStatus.NOT_FOUND);

        }



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

        if (!doc.sbisId) {
            throw new HttpException('Document has no SBIS id', HttpStatus.BAD_REQUEST);
        }

        const r = await this.sbis.enqueueDocument(doc.type, {
            id: doc.id,
            sbisId: doc.sbisId,
            number: doc.number,
        });

        if (!r.ok) {
            await doc.update({
                status: 'failed',
                sbisLastError: r.detail || 'sbis',
                sbisAttemptCount: doc.sbisAttemptCount + 1,
            });
            throw new HttpException(
                r.detail || 'SBIS EDO send failed',
                HttpStatus.BAD_GATEWAY,
            );
        }

        await doc.update({
            status: 'sent_to_sbis',
            sbisStatus: 'sent_to_sbis',
            sbisLastError: null,
            sbisAttemptCount: doc.sbisAttemptCount + 1,
        });

        return { ok: true };

    }

    async deleteDocument(
        actingUserId: number,
        organizationId: number,
        docId: string,
        isAdmin: boolean,
    ): Promise<{ ok: true }> {
        if (!isAdmin) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }

        const org = await this.assertOrgAccess(actingUserId, organizationId, true);
        const normalizedDocId = extractOrganizationDocumentId(docId) || docId.trim();
        const doc = await this.docModel.findOne({
            where: { id: normalizedDocId, userId: String(org.userId), organizationId },
        });
        if (!doc) {
            throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
        }

        if (doc.pdfPath) {
            const abs = join(process.cwd(), 'static', doc.pdfPath);
            if (existsSync(abs)) {
                try {
                    await unlinkAsync(abs);
                } catch (e) {
                    this.logger.warn(
                        `Failed to remove PDF file ${abs}: ${(e as Error).message}`,
                    );
                }
            }
        }

        await doc.destroy();
        return { ok: true };
    }

}


