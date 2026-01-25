import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import axios from 'axios';
import { Rates } from "./rates.model";

interface CurrencyData {
    timestamp: number,
    base: string,
    rates: object
}

@Injectable()
export class CurrencyService {
    private readonly logger = new Logger(CurrencyService.name);

    constructor(@InjectModel(Rates) private readonly ratesRepository: typeof Rates) { }

    async updateRates() {
        this.logger.log('Fetching latest currency rates from exchangerate.host...');

        try {
            const currency_update_url = process.env.CURRENCY_UPDATE_URL;

            const { data } = await axios.get(currency_update_url);
            const rates: CurrencyData = data.rates;

            const bulkData = Object.entries(rates).map(([currency, rate]) => ({
                currency,
                rate,
                updatedAt: new Date(),
            }));

            // Sequelize поддерживает UPSERT (обновление при совпадении по уникальному ключу)
            await this.ratesRepository.bulkCreate(bulkData, {
                updateOnDuplicate: ['rate', 'updatedAt'],
            });

            this.logger.log(`Currency rates successfully updated (${Object.keys(rates).length} records)`);

            return { updatedAt: new Date(), count: Object.keys(rates).length };
        } catch (error) {
            this.logger.error('Failed to update currency rates:', error.message);
            throw error;
        }
    }
    async convertToUsd(amount: number, currency: string): Promise<number> {
        if (currency.toUpperCase() === 'USD') {
            return amount;
        }

        const rateCurrency = await this.ratesRepository.findOne({ where: { currency: currency.toUpperCase() } });
        const rateUsd = await this.ratesRepository.findOne({ where: { currency: 'USD' } });

        if (!rateCurrency) {
            this.logger.error(`Rate for currency ${currency} not found`);
            throw new Error(`Rate for currency ${currency} not found`);
        }

        // Assume base is USD if Rate_USD is not found, creating a fallback or just erroring.
        // If the service uses a base different from USD, Rate_USD should exist.
        // If Rate_USD is missing, and we are not converting TO Base (which is unknown), we might default to 1 if we assume Base=USD, or fail.
        // Safest is to use the rate found.
        const rateUsdValue = rateUsd ? rateUsd.rate : 1;

        // Formula: Amount * (Rate_USD / Rate_Currency)
        const converted = amount * (rateUsdValue / rateCurrency.rate);

        // Return with 2 decimal precision
        return Math.round(converted * 100) / 100;
    }
}
