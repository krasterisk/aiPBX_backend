import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OperatorAnalyticsService } from './operator-analytics.service';

/**
 * Scheduled enforcement of the operator-analytics data retention policy.
 * No-op unless OPERATOR_RETENTION_DAYS > 0 (default disabled, prod-safe).
 */
@Injectable()
export class OperatorRetentionTask {
    private readonly logger = new Logger(OperatorRetentionTask.name);

    constructor(private readonly service: OperatorAnalyticsService) {}

    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async handleRetention(): Promise<void> {
        try {
            const result = await this.service.applyRetention();
            if (result.enabled && result.scanned > 0) {
                this.logger.log(
                    `Retention run: mode=${result.mode} cutoff=${result.cutoff} scanned=${result.scanned} affected=${result.affected}`,
                );
            }
        } catch (e) {
            this.logger.error(`Retention run failed: ${(e as Error).message}`, e as Error);
        }
    }
}
