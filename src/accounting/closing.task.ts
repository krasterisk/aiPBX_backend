import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { OrganizationDocument } from './organization-document.model';
import { SbisService } from './sbis.service';
import { ClosingService } from './closing.service';

@Injectable()
export class ClosingTask {
    private readonly logger = new Logger(ClosingTask.name);

    constructor(
        @InjectModel(OrganizationDocument) private readonly docModel: typeof OrganizationDocument,
        private readonly closingService: ClosingService,
        private readonly sbis: SbisService,
    ) {}

    @Cron('0 3 1 * *')
    async monthlyClosingDocuments(): Promise<void> {
        this.logger.log('monthlyClosingDocuments: start');
        await this.closingService.runMonthlyClosing();
        this.logger.log('monthlyClosingDocuments: done');
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
