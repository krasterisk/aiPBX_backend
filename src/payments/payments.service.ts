import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Payments } from "./payments.model";
import { PaymentsDto } from "./dto/payments.dto";
import { UsersService } from "../users/users.service";
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TelegramService } from "../telegram/telegram.service";

import { CurrencyService } from "../currency/currency.service";

@Injectable()
export class PaymentsService {
    private stripe: Stripe;

    constructor(
        @InjectModel(Payments) private paymentsRepository: typeof Payments,
        private readonly usersService: UsersService,
        private configService: ConfigService,
        private readonly telegramService: TelegramService,
        private readonly currencyService: CurrencyService
    ) {
        this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET_KEY'), {
            apiVersion: '2026-01-28.clover',
        });
    }

    async create(dto: PaymentsDto[]) {
        try {
            const payments = [];
            for (const payment of dto) {
                if (!payment.userId) {
                    throw new HttpException('[Payments]: UserId must be set', HttpStatus.BAD_REQUEST)
                }

                const isPayed = await this.usersService.updateUserBalance(payment.userId, payment.amount)
                if (isPayed) {
                    const result = await this.paymentsRepository.create(payment)
                    payments.push(result)
                }
            }
            return payments
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                throw new HttpException('Duplicate Payment', HttpStatus.BAD_REQUEST)
            }
            throw new HttpException('[Payments]: Request error' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async createStripePaymentIntent(userId: string, amount: number, currency: string) {
        try {
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency,
                metadata: { userId },
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            // Save pending payment
            await this.paymentsRepository.create({
                userId,
                amount,
                currency,
                stripePaymentIntentId: paymentIntent.id,
                status: 'pending',
                paymentMethod: 'stripe'
            } as any);

            return {
                clientSecret: paymentIntent.client_secret,
                id: paymentIntent.id
            };
        } catch (error) {
            throw new HttpException(`Stripe Error: ${error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    async handleWebhook(signature: string, payload: Buffer) {
        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
        let event: Stripe.Event;

        try {
            event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        } catch (err) {
            throw new HttpException(`Webhook Error: ${err.message}`, HttpStatus.BAD_REQUEST);
        }

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            await this.finalizePayment(paymentIntent);
        } else if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            await this.failPayment(paymentIntent);
        }

        return { received: true };
    }

    async getUserPayments(userId: string, page: number = 1, limit: number = 10) {
        try {
            const offset = (page - 1) * limit;
            const payments = await this.paymentsRepository.findAndCountAll({
                where: { userId },
                attributes: [
                    'id',
                    'amount',
                    'currency',
                    'status',
                    'createdAt',
                    'paymentMethod',
                    ['paymentInfo', 'description']
                ],
                order: [['createdAt', 'DESC']],
                limit,
                offset
            });
            return payments;
        } catch (e) {
            throw new HttpException('Error fetching payments', HttpStatus.BAD_REQUEST);
        }
    }

    private async finalizePayment(paymentIntent: Stripe.PaymentIntent) {
        const payment = await this.paymentsRepository.findOne({ where: { stripePaymentIntentId: paymentIntent.id } });
        if (payment && payment.status !== 'succeeded') {
            payment.status = 'succeeded';
            await payment.save();

            let amountToAdd = payment.amount;
            if (payment.currency.toUpperCase() !== 'USD') {
                amountToAdd = await this.currencyService.convertToUsd(payment.amount, payment.currency);
            }

            await this.usersService.updateUserBalance(payment.userId, amountToAdd);

            let message = `✅ Payment Successful!\nUser ID: ${payment.userId}\nAmount: ${payment.amount} ${payment.currency.toUpperCase()}\nStatus: ${payment.status}`;
            if (payment.currency.toUpperCase() !== 'USD') {
                message += `\nConverted to: ${amountToAdd} USD`;
            }

            await this.telegramService.sendMessage(message);
        }
    }

    private async failPayment(paymentIntent: Stripe.PaymentIntent) {
        const payment = await this.paymentsRepository.findOne({ where: { stripePaymentIntentId: paymentIntent.id } });
        if (payment) {
            payment.status = 'failed';
            await payment.save();

            await this.telegramService.sendMessage(
                `❌ Payment Failed!\nUser ID: ${payment.userId}\nAmount: ${payment.amount} ${payment.currency.toUpperCase()}\nStatus: ${payment.status}`
            );
        }
    }
}