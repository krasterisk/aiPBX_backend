import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Prices } from "./prices.model";
import { CreatePriceDto } from "./dto/create-price.dto";
import { UpdatePriceDto } from "./dto/update-price.dto";
import { User } from "../users/users.model";

@Injectable()
export class PricesService {
    constructor(
        @InjectModel(Prices) private pricesRepository: typeof Prices) { }

    async create(dto: CreatePriceDto) {
        try {
            const existingPrice = await this.pricesRepository.findOne({ where: { userId: dto.userId } });
            if (existingPrice) {
                // If exists, maybe we should just return it or throw error?
                // User asked for "add", implying new. If duplicate userId (unique), it will fail anyway.
                // Let's allow sequelize to handle uniqueness or check explicitly.
                throw new HttpException('Price for this user already exists', HttpStatus.BAD_REQUEST);
            }
            const price = await this.pricesRepository.create(dto);
            return price;
        } catch (e) {
            if (e instanceof HttpException) {
                throw e;
            }
            throw new HttpException('[Prices]: Request error ' + e.message, HttpStatus.BAD_REQUEST);
        }
    }

    async findAll() {
        const prices = await this.pricesRepository.findAll({ include: [User] });
        return prices;
    }

    async findOne(id: number) {
        const price = await this.pricesRepository.findByPk(id, { include: { all: true } });
        if (!price) {
            throw new HttpException('Price not found', HttpStatus.NOT_FOUND);
        }
        return price;
    }

    async update(id: number, dto: UpdatePriceDto) {
        const price = await this.pricesRepository.findByPk(id);
        if (!price) {
            throw new HttpException('Price not found', HttpStatus.NOT_FOUND);
        }
        await price.update(dto);
        return price;
    }

    async remove(id: number) {
        const price = await this.pricesRepository.findByPk(id);
        if (!price) {
            throw new HttpException('Price not found', HttpStatus.NOT_FOUND);
        }
        await price.destroy();
        return { message: 'Price deleted' };
    }
}
