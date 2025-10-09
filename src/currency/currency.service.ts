import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import axios from 'axios';
import {Rates} from "./rates.model";

interface CurrencyData {
    timestamp: number,
    base: string,
    rates: object
}

@Injectable()
export class CurrencyService {
    private readonly logger = new Logger(CurrencyService.name);

    constructor(@InjectModel(Rates) private readonly ratesRepository: typeof Rates) {}

    async updateRates() {
        this.logger.log('Fetching latest currency rates from exchangerate.host...');

        try {
            const currency_update_url=process.env.CURRENCY_UPDATE_URL;

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
}
