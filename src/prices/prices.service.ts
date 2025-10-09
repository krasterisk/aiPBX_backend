import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Prices} from "./prices.model";
import {PricesDto} from "./dto/pices.dto";

@Injectable()
export class PricesService {
    constructor(
        @InjectModel(Prices) private pricesRepository: typeof Prices) {}

    async create(dto: PricesDto[]) {
        try {
            const prices = [];
            for (const price of dto) {
                if (!price.userId) {
                    throw new HttpException('[Prices]: UserId must be set', HttpStatus.BAD_REQUEST)
                }
                const result = await this.pricesRepository.create(price)
                prices.push(result)
            }
            return prices
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Duplicate Price', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Prices]: Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

}
