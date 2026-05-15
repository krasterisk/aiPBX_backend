import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize, Transaction } from 'sequelize';
import { Payments } from "./payments.model";
import { PaymentsDto } from "./dto/payments.dto";
import { UsersService } from "../users/users.service";
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { TelegramService } from "../telegram/telegram.service";
import { CurrencyService } from "../currency/currency.service";
import { LoggerService } from "../logger/logger.service";
import { InvoiceService } from '../accounting/invoice.service';
import { CurrencyHistory } from '../accounting/currency-history.model';
import { BalanceLedger } from '../accounting/balance-ledger.model';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
    private stripe: Stripe;
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        @InjectModel(Payments) private paymentsRepository: typeof Payments,
        @InjectModel(CurrencyHistory) private currencyHistoryRepository: typeof CurrencyHistory,
        @InjectModel(BalanceLedger) private balanceLedgerRepository: typeof BalanceLedger,
        @InjectConnection() private readonly sequelize: Sequelize,
        private readonly usersService: UsersService,
        private configService: ConfigService,
        private readonly telegramService: TelegramService,
        private readonly currencyService: CurrencyService,
        private readonly logService: LoggerService,
        private readonly invoiceService: InvoiceService,
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

                const result = await this.paymentsRepository.create(payment as any);
                const isPayed = await this.usersService.updateUserBalance(payment.userId, payment.amount, {
                    source: 'admin',
                    externalId: `payment_${result.id}`,
                    paymentId: String(result.id),
                });
                if (isPayed) {
                    payments.push(result);
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
            const ownerId = String(await this.usersService.resolveOwnerId(userId));
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency,
                metadata: { userId: ownerId },
                automatic_payment_methods: {
                    enabled: true,
                },
            });

            // Save pending payment
            await this.paymentsRepository.create({
                userId: ownerId,
                amount,
                currency,
                stripePaymentIntentId: paymentIntent.id,
                status: 'pending',
                paymentMethod: 'stripe'
            } as any);

            await this.logService.logAction(
                Number(userId), 'create', 'payment', null,
                `Stripe payment intent created: $${amount} ${currency}`,
                null, { paymentIntentId: paymentIntent.id, amount, currency },
                null, 'info',
            );

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

    /**
     * @param tokenUserId — id из JWT
     * @param isAdmin — если true: без filterUserId вернуть все платежи; с filterUserId — по владельцу тенанта
     * @param filterUserId — только для админа: userId клиента (после resolveOwnerId)
     */
    async getUserPayments(
        tokenUserId: string,
        page: number = 1,
        limit: number = 10,
        isAdmin = false,
        filterUserId?: string,
    ) {
        try {
            const offset = (page - 1) * limit;
            let where: { userId: string } | Record<string, never> = {};

            if (isAdmin) {
                if (filterUserId) {
                    const ownerId = String(await this.usersService.resolveOwnerId(filterUserId));
                    where = { userId: ownerId };
                }
            } else {
                const ownerId = String(await this.usersService.resolveOwnerId(tokenUserId));
                where = { userId: ownerId };
            }

            const result = await this.paymentsRepository.findAndCountAll({
                where,
                attributes: [
                    'id',
                    'amount',
                    'currency',
                    'status',
                    'createdAt',
                    'paymentMethod',
                    ['paymentInfo', 'description'],
                    'receiptUrl',
                    'fxRateRubUsd',
                    'amountRub',
                ],
                order: [['createdAt', 'DESC']],
                limit,
                offset
            });
            const rows = result.rows.map((row) => {
                const plain = row.get({ plain: true });
                const rubPerUsd = plain.fxRateRubUsd != null ? Number(plain.fxRateRubUsd) : null;
                return {
                    ...plain,
                    fxRateUsdToCurrency: Number.isFinite(rubPerUsd) && rubPerUsd > 0 ? rubPerUsd : null,
                };
            });
            return { count: result.count, rows };
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

            await this.usersService.updateUserBalance(payment.userId, amountToAdd, {
                source: 'stripe',
                externalId: paymentIntent.id,
                paymentId: String(payment.id),
            });

            await this.logService.logAction(
                Number(payment.userId), 'update', 'payment', payment.id,
                `Stripe payment succeeded: $${payment.amount} ${payment.currency.toUpperCase()}`,
                null, { amount: payment.amount, currency: payment.currency, amountUsd: amountToAdd },
                null, 'critical',
            );

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

            await this.logService.logAction(
                Number(payment.userId), 'update', 'payment', payment.id,
                `Stripe payment failed: $${payment.amount} ${payment.currency.toUpperCase()}`,
                null, { amount: payment.amount, currency: payment.currency },
                null, 'warning',
            );

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
            const ownerId = String(await this.usersService.resolveOwnerId(userId));
            const { rate: rubPerUsd } = await this.currencyService.convertFromUsd(1, 'RUB');
            const payment = await this.paymentsRepository.create({
                userId: ownerId,
                amount,
                currency: 'RUB',
                status: 'pending',
                paymentMethod: 'robokassa',
                paymentInfo: description || 'Account top-up',
                amountRub: amount,
                fxRateRubUsd: rubPerUsd > 0 ? rubPerUsd : null,
            } as any);

            // Use payment.id as InvId
            const invId = payment.id;
            await payment.update({ robokassaInvId: invId });

            const merchantLogin = this.configService.get<string>('ROBOKASSA_MERCHANT_LOGIN');
            const password1 = this.configService.get<string>('ROBOKASSA_PASSWORD_1');
            const isTest = this.configService.get<string>('ROBOKASSA_TEST_MODE') === '1';
            const outSum = amount.toFixed(2);

            // Signature: MD5(MerchantLogin:OutSum:InvId:Password#1:Shp_userId=ownerId)
            const signatureString = `${merchantLogin}:${outSum}:${invId}:${password1}:Shp_userId=${ownerId}`;
            const signatureValue = this.generateRobokassaSignature(signatureString);

            const params = new URLSearchParams({
                MerchantLogin: merchantLogin,
                OutSum: outSum,
                InvId: String(invId),
                Description: description || 'Account top-up',
                SignatureValue: signatureValue,
                Shp_userId: ownerId,
            });

            if (isTest) {
                params.append('IsTest', '1');
            }

            const paymentUrl = `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;

            this.logger.log(`Robokassa payment created: InvId=${invId}, amount=${outSum} RUB, userId=${userId}`);

            await this.logService.logAction(
                Number(userId), 'create', 'payment', invId,
                `Robokassa payment created: ${outSum} RUB`,
                null, { invId, amount, currency: 'RUB' },
                null, 'info',
            );

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

            await this.logService.logAction(
                0, 'other', 'payment', invId,
                `Robokassa signature mismatch for InvId=${invId}`,
                null, { invId, outSum, shpUserId },
                null, 'critical',
            );

            throw new HttpException('Invalid signature', HttpStatus.BAD_REQUEST);
        }

        const payment = await this.paymentsRepository.findOne({ where: { robokassaInvId: invId } });
        if (!payment) {
            throw new HttpException(`Payment not found: InvId=${invId}`, HttpStatus.NOT_FOUND);
        }

        if (payment.status === 'succeeded') {
            return `OK${invId}`;
        }

        // Convert RUB → USD and add to balance
        const amount = parseFloat(outSum);
        const amountUsd = await this.currencyService.convertToUsd(amount, 'RUB');
        const rubPerUsd = amountUsd > 0 ? amount / amountUsd : 0;

        payment.status = 'succeeded';
        payment.amountRub = amount;
        payment.fxRateRubUsd = rubPerUsd > 0 ? rubPerUsd : payment.fxRateRubUsd;
        await payment.save();

        await this.usersService.updateUserBalance(shpUserId, amountUsd, {
            source: 'robokassa',
            externalId: String(invId),
            paymentId: String(payment.id),
        });

        await this.logService.logAction(
            Number(shpUserId), 'update', 'payment', invId,
            `Robokassa payment succeeded: ${amount} RUB → ${amountUsd} USD`,
            null, { invId, amount, amountUsd, currency: 'RUB' },
            null, 'critical',
        );

        const message = `✅ Robokassa Payment Successful!\nUser ID: ${shpUserId}\nAmount: ${amount} RUB\nConverted to: ${amountUsd} USD\nInvId: ${invId}`;
        await this.telegramService.sendMessage(message);

        this.logger.log(`Robokassa payment finalized: InvId=${invId}, ${amount} RUB → ${amountUsd} USD, userId=${shpUserId}`);

        return `OK${invId}`;
    }

    async getRobokassaPaymentStatus(invId: number, userId: string) {
        const ownerId = String(await this.usersService.resolveOwnerId(userId));
        const payment = await this.paymentsRepository.findOne({
            where: { robokassaInvId: invId, userId: ownerId },
            attributes: ['id', 'amount', 'currency', 'status', 'paymentMethod', 'createdAt'],
        });

        if (!payment) {
            throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
        }

        return payment;
    }

    /**
     * Form-encoded callback compatible with alfawebhook pbxBalanceUpdate (OutSumm, InvId, userId, pbxUrl, payerBankName).
     */
    async handleAlfaBankCallback(
        body: Record<string, string | undefined>,
        headers: Record<string, string | undefined>,
    ): Promise<{ ok: boolean }> {
        const secret = this.configService.get<string>('ALFA_CALLBACK_SECRET');
        if (secret) {
            const sig = headers['x-alfa-signature'] || headers['X-Alfa-Signature'];
            const invIdForSig = String(body.InvId || '');
            const expected = crypto.createHmac('sha256', secret).update(invIdForSig).digest('hex');
            if (sig !== expected) {
                throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
            }
        }

        const invId = String(body.InvId || '');
        const userId = String(body.userId || '');
        const outSumm = parseFloat(String(body.OutSumm || '0'));
        if (!invId || !userId || Number.isNaN(outSumm) || outSumm <= 0) {
            throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
        }

        const ownerId = await this.usersService.resolveOwnerId(userId);
        const amountUsd = await this.currencyService.convertToUsd(outSumm, 'RUB');
        const fxDate = new Date().toISOString().slice(0, 10);
        const rubPerUsd = amountUsd > 0 ? outSumm / amountUsd : 0;

        await this.sequelize.transaction(
            { isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE },
            async (transaction) => {
            const existing = await this.balanceLedgerRepository.findOne({
                where: { source: 'alfa_bank', externalId: invId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (existing) {
                return;
            }

            const payment = await this.paymentsRepository.create(
                {
                    userId: String(ownerId),
                    amount: amountUsd,
                    currency: 'USD',
                    status: 'succeeded',
                    paymentMethod: 'alfa_bank_invoice',
                    paymentInfo: `RUB ${outSumm.toFixed(2)} (InvId ${invId})`,
                    alfaInvId: invId,
                    idempotencyKey: `alfa:${invId}`,
                    fxRateRubUsd: rubPerUsd > 0 ? rubPerUsd : null,
                    amountRub: outSumm,
                } as any,
                { transaction },
            );

            await this.usersService.updateUserBalance(String(ownerId), amountUsd, {
                source: 'alfa_bank',
                externalId: invId,
                paymentId: String(payment.id),
                transaction,
            });

            try {
                await this.invoiceService.createAdvanceAfterBankPayment({
                    userId: Number(ownerId),
                    amountRub: outSumm,
                    paymentId: String(payment.id),
                    externalTransactionId: invId,
                    transaction,
                });
            } catch (e) {
                this.logger.warn(`advance invoice: ${(e as Error).message}`);
            }

            if (rubPerUsd > 0) {
                await this.currencyHistoryRepository
                    .create(
                        {
                            atDate: fxDate,
                            fromCurrency: 'USD',
                            toCurrency: 'RUB',
                            rate: rubPerUsd.toFixed(8),
                        } as any,
                        { transaction },
                    )
                    .catch(() => undefined);
            }
        });

        await this.logService.logAction(
            Number(ownerId),
            'update',
            'payment',
            null,
            `Alfa bank invoice credited: ${outSumm} RUB → ${amountUsd} USD (InvId=${invId})`,
            null,
            { invId, outSumm, amountUsd },
            null,
            'critical',
        );

        await this.telegramService.sendMessage(
            `✅ Alfa bank payment\nUser: ${ownerId}\n${outSumm} RUB → ${amountUsd} USD\nInvId: ${invId}`,
        );

        return { ok: true };
    }

    private generateRobokassaSignature(str: string): string {
        return crypto.createHash('sha512').update(str).digest('hex');
    }
}
