import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OperatorAnalyticsService } from './operator-analytics.service';

/**
 * Scheduled anomaly detection (CSAT drop / negativity spike).
 * No-op unless OPERATOR_ANOMALY_ENABLED=true (default off, prod-safe).
 */
@Injectable()
export class OperatorAnomalyTask {
    private readonly logger = new Logger(OperatorAnomalyTask.name);

    constructor(private readonly service: OperatorAnalyticsService) {}

    @Cron(CronExpression.EVERY_DAY_AT_4AM)
    async handleAnomalyCheck(): Promise<void> {
        try {
            const result = await this.service.checkAnomalies();
            if (result.enabled && result.alerted > 0) {
                this.logger.log(`Anomaly check: projects=${result.checked} alerts=${result.alerted}`);
            }
        } catch (e) {
            this.logger.error(`Anomaly check failed: ${(e as Error).message}`, e as Error);
        }
    }
}
