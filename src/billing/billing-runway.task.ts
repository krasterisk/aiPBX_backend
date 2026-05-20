import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingRunwayService } from './billing-runway.service';

@Injectable()
export class BillingRunwayTask {
    private readonly logger = new Logger(BillingRunwayTask.name);

    constructor(private readonly runwayService: BillingRunwayService) {}

    /** Daily at 09:00 server local time (skipped when invoice billing is disabled). */
    @Cron('0 9 * * *')
    async handleDailyRunwayCheck(): Promise<void> {
        this.logger.log('Balance runway daily check: start');
        try {
            const result = await this.runwayService.runDailyCheck();
            this.logger.log(
                `Balance runway daily check: done (processed=${result.processed}, notified=${result.notified})`,
            );
        } catch (e) {
            this.logger.error(`Balance runway daily check failed: ${(e as Error).message}`, e);
        }
    }
}
