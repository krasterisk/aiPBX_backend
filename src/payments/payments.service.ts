import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { Payments } from "./payments.model";
import { PaymentsDto } from "./dto/payments.dto";
import { UsersService } from "../users/users.service";
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TelegramService } from "../telegram/telegram.service";
import { CurrencyService } from "../currency/currency.service";
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
    private stripe: Stripe;
    private readonly logger = new Logger(PaymentsService.name);

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
                where: { userId: String(userId) },
                attributes: [
                    'id',
                    'amount',
                    'currency',
                    'status',
                    'createdAt',
                    'paymentMethod',
                    ['paymentInfo', 'description'],
                    'receiptUrl'
                ],
                order: [['createdAt', 'DESC']],
                limit,
                offset
            });
            return payments;
        } catch (e) {
            console.error('[Payments] getUserPayments error:', e.message, e.sql || '');
            throw new HttpException('Error fetching payments: ' + e.message, HttpStatus.BAD_REQUEST);
        }
    }

    private async finalizePayment(paymentIntent: Stripe.PaymentIntent) {
        const payment = await this.paymentsRepository.findOne({ where: { stripePaymentIntentId: paymentIntent.id } });
        if (payment && payment.status !== 'succeeded') {
            // Fetch receipt URL from Stripe Charge
            try {
                const charges = await this.stripe.charges.list({ payment_intent: paymentIntent.id, limit: 1 });
                payment.receiptUrl = charges.data[0]?.receipt_url ?? null;
            } catch (e) {
                // Non-critical: proceed without receipt URL
            }

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

    // ========================
    // Robokassa Methods
    // ========================

    async createRobokassaPayment(userId: string, amount: number, description?: string) {
        try {
            const payment = await this.paymentsRepository.create({
                userId,
                amount,
                currency: 'RUB',
                status: 'pending',
                paymentMethod: 'robokassa',
                paymentInfo: description || 'Account top-up',
            } as any);

            // Use payment.id as InvId
            const invId = payment.id;
            await payment.update({ robokassaInvId: invId });

            const merchantLogin = this.configService.get<string>('ROBOKASSA_MERCHANT_LOGIN');
            const password1 = this.configService.get<string>('ROBOKASSA_PASSWORD_1');
            const isTest = this.configService.get<string>('ROBOKASSA_TEST_MODE') === '1';
            const outSum = amount.toFixed(2);

            // Signature: MD5(MerchantLogin:OutSum:InvId:Password#1:Shp_userId=userId)
            const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}:Shp_userId=${userId}`;
            const signatureValue = this.generateRobokassaSignature(signatureString);

            const params = new URLSearchParams({
                MerchantLogin: merchantLogin,
                OutSum: outSum,
                InvId: String(invId),
                Description: description || 'Account top-up',
                SignatureValue: signatureValue,
                Shp_userId: userId,
            });

            if (isTest) {
                params.append('IsTest', '1');
            }

            const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;

            this.logger.log(`Robokassa payment created: InvId=${invId}, amount=${outSum} RUB, userId=${userId}`);

            return { paymentUrl, invId };
        } catch (error) {
            throw new HttpException(`Robokassa Error: ${error.message}`, HttpStatus.BAD_REQUEST);
        }
    }

    async handleRobokassaResult(outSum: string, invId: number, signatureValue: string, shpUserId: string): Promise<string> {
        const password2 = this.configService.get<string>('ROBOKASSA_PASSWORD_2');

        // Verify signature: MD5(OutSum:InvId:Password#2:Shp_userId=value)
        const expectedSignature = this.generateRobokassaSignature(
            `${outSum}:${invId}:${password2}:Shp_userId=${shpUserId}`
        );

        if (signatureValue.toUpperCase() !== expectedSignature.toUpperCase()) {
            this.logger.error(`Robokassa signature mismatch for InvId=${invId}`);
            throw new HttpException('Invalid signature', HttpStatus.BAD_REQUEST);
        }

        const payment = await this.paymentsRepository.findOne({ where: { robokassaInvId: invId } });
        if (!payment) {
            throw new HttpException(`Payment not found: InvId=${invId}`, HttpStatus.NOT_FOUND);
        }

        if (payment.status === 'succeeded') {
            return `OK${invId}`;
        }

        payment.status = 'succeeded';
        await payment.save();

        // Convert RUB → USD and add to balance
        const amount = parseFloat(outSum);
        const amountUsd = await this.currencyService.convertToUsd(amount, 'RUB');
        await this.usersService.updateUserBalance(shpUserId, amountUsd);

        const message = `✅ Robokassa Payment Successful!\nUser ID: ${shpUserId}\nAmount: ${amount} RUB\nConverted to: ${amountUsd} USD\nInvId: ${invId}`;
        await this.telegramService.sendMessage(message);

        this.logger.log(`Robokassa payment finalized: InvId=${invId}, ${amount} RUB → ${amountUsd} USD, userId=${shpUserId}`);

        return `OK${invId}`;
    }

    async getRobokassaPaymentStatus(invId: number, userId: string) {
        const payment = await this.paymentsRepository.findOne({
            where: { robokassaInvId: invId, userId: String(userId) },
            attributes: ['id', 'amount', 'currency', 'status', 'paymentMethod', 'createdAt'],
        });

        if (!payment) {
            throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
        }

        return payment;
    }

    private generateRobokassaSignature(str: string): string {
        return crypto.createHash('sha512').update(str).digest('hex');
    }
}