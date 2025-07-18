import {HttpException, HttpStatus, Injectable} from '@nestjs/common';
import {InjectModel} from "@nestjs/sequelize";
import {Payments} from "./payments.model";
import {PaymentsDto} from "./dto/payments.dto";
import {UsersService} from "../users/users.service";

@Injectable()
export class PaymentsService {
    constructor(
        @InjectModel(Payments) private paymentsRepository: typeof Payments,
        private readonly usersService: UsersService,
        ) {}

    async create(dto: PaymentsDto[]) {
        try {
            const payments = [];
            for (const payment of dto) {
                if (!payment.userId) {
                    throw new HttpException('[Payments]: UserId must be set', HttpStatus.BAD_REQUEST)
                }

                const isPayed = await this.usersService.updateUserBalance(payment.userId, payment.summa)
                if(isPayed) {
                    const result = await this.paymentsRepository.create(payment)
                    payments.push(result)
                }
            }
            return payments
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Duplicate Payment', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Payments]: Request error' +e, HttpStatus.BAD_REQUEST)
        }
    }

}
