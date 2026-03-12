import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CurrencyService } from './currency.service';
import { InjectModel } from '@nestjs/sequelize';
import { Rates } from './rates.model';

@Injectable()
export class CurrencyTask implements OnModuleInit {
    private readonly logger = new Logger(CurrencyTask.name);

    constructor(
        private readonly currencyService: CurrencyService,
        @InjectModel(Rates) private readonly ratesRepository: typeof Rates,
    ) {}

    // При старте приложения — обновить курсы, если таблица пустая
    async onModuleInit() {
        try {
            const count = await this.ratesRepository.count();
            if (count === 0) {
                this.logger.log('Rates table is empty, fetching initial currency rates...');
                await this.currencyService.updateRates();
            }
        } catch (err) {
            this.logger.error('Failed to seed initial currency rates', err.message);
        }
    }

    // Запускаем каждый день в 1:00
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
