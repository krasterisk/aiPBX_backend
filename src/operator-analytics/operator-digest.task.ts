import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OperatorDigestService } from './operator-digest.service';

/**
 * Hourly check for due analytics digests (email + Telegram).
 * Actual send hour/day are filtered inside isDigestDue() using TIMEZONE.
 */
@Injectable()
export class OperatorDigestTask {
    private readonly logger = new Logger(OperatorDigestTask.name);

    constructor(private readonly digestService: OperatorDigestService) {}

    @Cron('0 * * * *')
    async handleDigestCron(): Promise<void> {
        try {
            const result = await this.digestService.runScheduledDigests();
            if (result.sent > 0) {
                this.logger.log(`Digest cron: checked=${result.checked} sent=${result.sent}`);
            }
        } catch (e) {
            this.logger.error(`Digest cron failed: ${(e as Error).message}`, e as Error);
        }
    }
}