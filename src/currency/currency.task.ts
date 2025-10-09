import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CurrencyService } from './currency.service';

@Injectable()
export class CurrencyTask {
    private readonly logger = new Logger(CurrencyTask.name);

    constructor(private readonly currencyService: CurrencyService) {}

    // Запускаем каждые 12 часов
    @Cron(CronExpression.EVERY_DAY_AT_1AM)
    async handleCron() {
        this.logger.log('Starting scheduled currency rate update...');
        try {
            await this.currencyService.updateRates();
            this.logger.log('Currency rates successfully updated by scheduler ✅');
        } catch (err) {
            this.logger.error('Currency rate update failed', err.message);
        }
    }
}
