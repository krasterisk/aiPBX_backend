import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OperatorAnalyticsService } from './operator-analytics.service';

/**
 * Marks operator-analytics records stuck in `processing` as ERROR after a timeout.
 * No-op unless OPERATOR_STUCK_MINUTES > 0 (default disabled, prod-safe).
 */
@Injectable()
export class OperatorStuckReaperTask {
    private readonly logger = new Logger(OperatorStuckReaperTask.name);

    constructor(private readonly service: OperatorAnalyticsService) {}

    @Cron(CronExpression.EVERY_10_MINUTES)
    async handleStuckReaper(): Promise<void> {
        try {
            const result = await this.service.reapStuckProcessing();
            if (result.enabled && result.reaped > 0) {
                this.logger.log(
                    `Stuck reaper: cutoffMinutes=${result.cutoffMinutes} reaped=${result.reaped}`,
                );
            }
        } catch (e) {
            this.logger.error(`Stuck reaper failed: ${(e as Error).message}`, e as Error);
        }
    }
}
