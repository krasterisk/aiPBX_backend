import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { Payments } from './payments.model';
import { UsersService } from '../users/users.service';
import { TelegramService } from '../telegram/telegram.service';
import { CurrencyService } from '../currency/currency.service';
import { LoggerService } from '../logger/logger.service';

// Mock Stripe at module level
jest.mock('stripe', () => {
    return jest.fn().mockImplementation(() => ({
        paymentIntents: {
            create: jest.fn().mockResolvedValue({
                id: 'pi_test_123',
                client_secret: 'pi_test_123_secret_abc',
            }),
        },
        webhooks: {
            constructEvent: jest.fn(),
        },
        charges: {
            list: jest.fn().mockResolvedValue({
                data: [{ receipt_url: 'https://receipt.stripe.com/test' }],
            }),
        },
    }));
});

describe('PaymentsService', () => {
    let service: PaymentsService;
    let mockPaymentsRepo: any;
    let mockUsersService: any;
    let mockConfigService: any;
    let mockTelegramService: any;
    let mockCurrencyService: any;
    let mockLogService: any;

    const mockPayment = {
        id: 1,
        userId: '1',
        amount: 50,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'stripe',
        stripePaymentIntentId: 'pi_test_123',
        robokassaInvId: null,
        receiptUrl: null,
        save: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        mockPaymentsRepo = {
            create: jest.fn().mockResolvedValue({ ...mockPayment }),
            findOne: jest.fn(),
            findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
        };
        mockUsersService = {
            updateUserBalance: jest.fn().mockResolvedValue(true),
            resolveOwnerId: jest.fn().mockResolvedValue('1'),
        };
        mockConfigService = {
            get: jest.fn((key: string) => {
                const config = {
                    STRIPE_SECRET_KEY: 'sk_test_xxx',
                    STRIPE_WEBHOOK_SECRET: 'whsec_test_xxx',
                    ROBOKASSA_MERCHANT_LOGIN: 'test_merchant',
                    ROBOKASSA_PASSWORD_1: 'password1',
                    ROBOKASSA_PASSWORD_2: 'password2',
                    ROBOKASSA_TEST_MODE: '1',
                };
                return config[key];
            }),
        };
        mockTelegramService = {
            sendMessage: jest.fn().mockResolvedValue(undefined),
        };
        mockCurrencyService = {
            convertToUsd: jest.fn().mockResolvedValue(0.5), // 1 RUB = 0.01 USD → 50 RUB = 0.5 USD
        };
        mockLogService = {
            logAction: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentsService,
                { provide: getModelToken(Payments), useValue: mockPaymentsRepo },
                { provide: UsersService, useValue: mockUsersService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: TelegramService, useValue: mockTelegramService },
                { provide: CurrencyService, useValue: mockCurrencyService },
                { provide: LoggerService, useValue: mockLogService },
            ],
        }).compile();

        service = module.get<PaymentsService>(PaymentsService);
    });

    // ═══════════════════════════════════════════════════════════════════
    // create (batch payments)
    // ═══════════════════════════════════════════════════════════════════

    describe('create', () => {
        it('should throw when userId is missing', async () => {
            await expect(
                service.create([{ amount: 10 } as any]),
            ).rejects.toThrow('[Payments]: UserId must be set');
        });

        it('should update balance and create payment record', async () => {
            const result = await service.create([
                { userId: '1', amount: 100, currency: 'USD' } as any,
            ]);

            expect(mockUsersService.updateUserBalance).toHaveBeenCalledWith('1', 100);
            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: '1', amount: 100 }),
            );
            expect(result).toHaveLength(1);
        });

        it('should skip payment when balance update fails', async () => {
            mockUsersService.updateUserBalance.mockResolvedValue(false);

            const result = await service.create([
                { userId: '1', amount: 100, currency: 'USD' } as any,
            ]);

            expect(mockPaymentsRepo.create).not.toHaveBeenCalled();
            expect(result).toHaveLength(0);
        });

        it('should process multiple payments', async () => {
            const result = await service.create([
                { userId: '1', amount: 50, currency: 'USD' } as any,
                { userId: '2', amount: 100, currency: 'USD' } as any,
            ]);

            expect(mockUsersService.updateUserBalance).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Stripe: createStripePaymentIntent
    // ═══════════════════════════════════════════════════════════════════

    describe('createStripePaymentIntent', () => {
        it('should resolve ownerId for sub-users', async () => {
            mockUsersService.resolveOwnerId.mockResolvedValue('5'); // sub-user 10 → owner 5

            await service.createStripePaymentIntent('10', 50, 'usd');

            expect(mockUsersService.resolveOwnerId).toHaveBeenCalledWith('10');
            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: '5' }),
            );
        });

        it('should save pending payment record with Stripe payment intent ID', async () => {
            await service.createStripePaymentIntent('1', 25, 'usd');

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: '1',
                    amount: 25,
                    currency: 'usd',
                    stripePaymentIntentId: 'pi_test_123',
                    status: 'pending',
                    paymentMethod: 'stripe',
                }),
            );
        });

        it('should return client secret and payment intent ID', async () => {
            const result = await service.createStripePaymentIntent('1', 50, 'usd');

            expect(result.clientSecret).toBe('pi_test_123_secret_abc');
            expect(result.id).toBe('pi_test_123');
        });

        it('should log payment intent creation', async () => {
            await service.createStripePaymentIntent('1', 50, 'usd');

            expect(mockLogService.logAction).toHaveBeenCalledWith(
                1, 'create', 'payment', null,
                expect.stringContaining('Stripe payment intent created'),
                null,
                expect.objectContaining({ paymentIntentId: 'pi_test_123', amount: 50 }),
                null, 'info',
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getUserPayments
    // ═══════════════════════════════════════════════════════════════════

    describe('getUserPayments', () => {
        it('should resolve ownerId and paginate results', async () => {
            mockUsersService.resolveOwnerId.mockResolvedValue('5');
            mockPaymentsRepo.findAndCountAll.mockResolvedValue({
                rows: [mockPayment],
                count: 1,
            });

            const result = await service.getUserPayments('10', 1, 10, false);

            expect(mockUsersService.resolveOwnerId).toHaveBeenCalledWith('10');
            expect(mockPaymentsRepo.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: '5' },
                    limit: 10,
                    offset: 0,
                    order: [['createdAt', 'DESC']],
                }),
            );
            expect(result.count).toBe(1);
        });

        it('should use empty where for admin without filterUserId', async () => {
            mockPaymentsRepo.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
            await service.getUserPayments('1', 1, 10, true, undefined);
            expect(mockUsersService.resolveOwnerId).not.toHaveBeenCalled();
            expect(mockPaymentsRepo.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: {} }),
            );
        });

        it('should filter by resolved owner when admin passes filterUserId', async () => {
            mockUsersService.resolveOwnerId.mockResolvedValue('7');
            mockPaymentsRepo.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
            await service.getUserPayments('1', 1, 10, true, '99');
            expect(mockUsersService.resolveOwnerId).toHaveBeenCalledWith('99');
            expect(mockPaymentsRepo.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: '7' } }),
            );
        });

        it('should calculate correct offset for page 2', async () => {
            await service.getUserPayments('1', 2, 20, false);

            expect(mockPaymentsRepo.findAndCountAll).toHaveBeenCalledWith(
                expect.objectContaining({ offset: 20, limit: 20 }),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Robokassa: createRobokassaPayment
    // ═══════════════════════════════════════════════════════════════════

    describe('createRobokassaPayment', () => {
        it('should create pending payment in RUB', async () => {
            await service.createRobokassaPayment('1', 1000);

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: '1',
                    amount: 1000,
                    currency: 'RUB',
                    status: 'pending',
                    paymentMethod: 'robokassa',
                }),
            );
        });

        it('should return payment URL with correct params', async () => {
            const payment = {
                ...mockPayment,
                id: 42,
                update: jest.fn().mockResolvedValue(undefined),
            };
            mockPaymentsRepo.create.mockResolvedValue(payment);

            const result = await service.createRobokassaPayment('1', 1000, 'Пополнение');

            expect(result.paymentUrl).toContain('auth.robokassa.ru');
            expect(result.paymentUrl).toContain('MerchantLogin=test_merchant');
            expect(result.paymentUrl).toContain('OutSum=1000.00');
            expect(result.paymentUrl).toContain('InvId=42');
            expect(result.paymentUrl).toContain('IsTest=1'); // test mode
            expect(result.invId).toBe(42);
        });

        it('should resolve ownerId for sub-users', async () => {
            mockUsersService.resolveOwnerId.mockResolvedValue('5');

            await service.createRobokassaPayment('10', 500);

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: '5' }),
            );
        });

        it('should use default description when not provided', async () => {
            mockPaymentsRepo.create.mockResolvedValue({
                ...mockPayment,
                id: 1,
                update: jest.fn().mockResolvedValue(undefined),
            });

            await service.createRobokassaPayment('1', 500);

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ paymentInfo: 'Account top-up' }),
            );
        });

        it('should log payment creation', async () => {
            mockPaymentsRepo.create.mockResolvedValue({
                ...mockPayment,
                id: 1,
                update: jest.fn().mockResolvedValue(undefined),
            });

            await service.createRobokassaPayment('1', 2000, 'Test');

            expect(mockLogService.logAction).toHaveBeenCalledWith(
                1, 'create', 'payment', 1,
                expect.stringContaining('Robokassa payment created'),
                null,
                expect.objectContaining({ amount: 2000, currency: 'RUB' }),
                null, 'info',
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Robokassa: handleRobokassaResult (server-to-server callback)
    // ═══════════════════════════════════════════════════════════════════

    describe('handleRobokassaResult', () => {
        // Helper: generate valid signature matching the service's algorithm
        const generateSignature = (str: string): string => {
            const crypto = require('crypto');
            return crypto.createHash('sha512').update(str).digest('hex');
        };

        it('should throw when signature is invalid', async () => {
            await expect(
                service.handleRobokassaResult('1000.00', 42, 'invalid-sig', '1'),
            ).rejects.toThrow('Invalid signature');
        });

        it('should verify signature and finalize payment', async () => {
            const outSum = '500.00';
            const invId = 42;
            const shpUserId = '1';
            const validSig = generateSignature(`${outSum}:${invId}:password2:Shp_userId=${shpUserId}`);

            const payment = {
                ...mockPayment,
                status: 'pending',
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockPaymentsRepo.findOne.mockResolvedValue(payment);
            mockCurrencyService.convertToUsd.mockResolvedValue(5.5);

            const result = await service.handleRobokassaResult(outSum, invId, validSig, shpUserId);

            expect(result).toBe(`OK${invId}`);
            expect(payment.status).toBe('succeeded');
            expect(payment.save).toHaveBeenCalled();
        });

        it('should convert RUB to USD and update balance', async () => {
            const outSum = '1000.00';
            const invId = 1;
            const shpUserId = '5';
            const validSig = generateSignature(`${outSum}:${invId}:password2:Shp_userId=${shpUserId}`);

            mockPaymentsRepo.findOne.mockResolvedValue({
                ...mockPayment,
                status: 'pending',
                save: jest.fn().mockResolvedValue(undefined),
            });
            mockCurrencyService.convertToUsd.mockResolvedValue(11.0);

            await service.handleRobokassaResult(outSum, invId, validSig, shpUserId);

            expect(mockCurrencyService.convertToUsd).toHaveBeenCalledWith(1000, 'RUB');
            expect(mockUsersService.updateUserBalance).toHaveBeenCalledWith('5', 11.0);
        });

        it('should return OK immediately for already succeeded payments', async () => {
            const outSum = '500.00';
            const invId = 42;
            const shpUserId = '1';
            const validSig = generateSignature(`${outSum}:${invId}:password2:Shp_userId=${shpUserId}`);

            mockPaymentsRepo.findOne.mockResolvedValue({
                ...mockPayment,
                status: 'succeeded',
            });

            const result = await service.handleRobokassaResult(outSum, invId, validSig, shpUserId);

            expect(result).toBe(`OK${invId}`);
            expect(mockUsersService.updateUserBalance).not.toHaveBeenCalled();
        });

        it('should throw 404 when payment not found', async () => {
            const outSum = '500.00';
            const invId = 999;
            const shpUserId = '1';
            const validSig = generateSignature(`${outSum}:${invId}:password2:Shp_userId=${shpUserId}`);

            mockPaymentsRepo.findOne.mockResolvedValue(null);

            await expect(
                service.handleRobokassaResult(outSum, invId, validSig, shpUserId),
            ).rejects.toThrow('Payment not found');
        });

        it('should send Telegram notification on success', async () => {
            const outSum = '500.00';
            const invId = 10;
            const shpUserId = '1';
            const validSig = generateSignature(`${outSum}:${invId}:password2:Shp_userId=${shpUserId}`);

            mockPaymentsRepo.findOne.mockResolvedValue({
                ...mockPayment,
                status: 'pending',
                save: jest.fn().mockResolvedValue(undefined),
            });

            await service.handleRobokassaResult(outSum, invId, validSig, shpUserId);

            expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
                expect.stringContaining('Robokassa Payment Successful'),
            );
        });

        it('should log signature mismatch as critical', async () => {
            await service.handleRobokassaResult('1000.00', 42, 'bad-signature', '1')
                .catch(() => {});

            expect(mockLogService.logAction).toHaveBeenCalledWith(
                0, 'other', 'payment', 42,
                expect.stringContaining('signature mismatch'),
                null,
                expect.objectContaining({ invId: 42 }),
                null, 'critical',
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getRobokassaPaymentStatus
    // ═══════════════════════════════════════════════════════════════════

    describe('getRobokassaPaymentStatus', () => {
        it('should resolve ownerId and return payment', async () => {
            mockUsersService.resolveOwnerId.mockResolvedValue('5');
            mockPaymentsRepo.findOne.mockResolvedValue(mockPayment);

            const result = await service.getRobokassaPaymentStatus(42, '10');

            expect(mockPaymentsRepo.findOne).toHaveBeenCalledWith({
                where: { robokassaInvId: 42, userId: '5' },
                attributes: expect.arrayContaining(['id', 'amount', 'status']),
            });
            expect(result).toEqual(mockPayment);
        });

        it('should throw 404 when payment not found', async () => {
            mockPaymentsRepo.findOne.mockResolvedValue(null);

            await expect(
                service.getRobokassaPaymentStatus(999, '1'),
            ).rejects.toThrow('Payment not found');
        });
    });
});
