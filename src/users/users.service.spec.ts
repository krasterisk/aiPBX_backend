import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { getModelToken, getConnectionToken } from '@nestjs/sequelize';
import { UsersService } from './users.service';
import { User } from './users.model';
import { Rates } from '../currency/rates.model';
import { UserLimits } from './user-limits.model';
import { Payments } from '../payments/payments.model';
import { RolesService } from '../roles/roles.service';
import { FilesService } from '../files/files.service';
import { PricesService } from '../prices/prices.service';
import { MailerService } from '../mailer/mailer.service';
import { CurrencyService } from '../currency/currency.service';
import { BalanceLedger } from '../accounting/balance-ledger.model';

describe('UsersService', () => {
    let service: UsersService;
    let mockUsersRepo: any;
    let mockRatesRepo: any;
    let mockUserLimitsRepo: any;
    let mockPaymentsRepo: any;
    let mockRolesService: any;
    let mockFilesService: any;
    let mockPricesService: any;
    let mockMailerService: any;
    let mockCurrencyService: any;
    const originalTenantCurrency = process.env.TENANT_CURRENCY;

    const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        balance: 100,
        currency: 'USD',
        vpbx_user_id: null,
        roles: [{ id: 1, value: 'USER' }],
        $set: jest.fn().mockResolvedValue(undefined),
        $add: jest.fn().mockResolvedValue(undefined),
        $remove: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        reload: jest.fn().mockResolvedValue(undefined),
        setDataValue: jest.fn(),
    };

    beforeEach(async () => {
        mockUsersRepo = {
            create: jest.fn().mockResolvedValue({ ...mockUser }),
            findAll: jest.fn().mockResolvedValue([mockUser]),
            findOne: jest.fn().mockResolvedValue(mockUser),
            findByPk: jest.fn().mockResolvedValue(mockUser),
            findAndCountAll: jest.fn().mockResolvedValue({ rows: [mockUser], count: 1 }),
            increment: jest.fn().mockResolvedValue([{ length: 1 }]),
            decrement: jest.fn().mockResolvedValue([{ length: 1 }]),
            destroy: jest.fn().mockResolvedValue(1),
            count: jest.fn().mockResolvedValue(0),
        };
        mockRatesRepo = {
            findOne: jest.fn().mockResolvedValue({ currency: 'USD', rate: 1 }),
        };
        mockUserLimitsRepo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
        };
        mockPaymentsRepo = {
            create: jest.fn().mockResolvedValue({ id: 1 }),
        };
        mockRolesService = {
            getRoleByValue: jest.fn().mockResolvedValue({ id: 1, value: 'USER' }),
        };
        mockFilesService = {
            createFile: jest.fn().mockResolvedValue('avatar.png'),
        };
        mockPricesService = {
            create: jest.fn().mockResolvedValue({}),
            findByUserId: jest.fn().mockResolvedValue({ realtime: 35, analytic: 5, text: 1, stt: 0.1 }),
        };
        mockMailerService = {
            sendLowBalanceNotification: jest.fn(),
            sendCriticalBalanceNotification: jest.fn(),
            sendZeroBalanceNotification: jest.fn(),
        };
        mockCurrencyService = {
            convertFromUsd: jest.fn(async (amountUsd: number, currency: string) => {
                if (currency === 'RUB') {
                    return { amount: Math.round(amountUsd * 90 * 100) / 100, rate: 90 };
                }
                return { amount: amountUsd, rate: 1 };
            }),
        };
        process.env.TENANT_CURRENCY = 'USD';

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: getModelToken(User), useValue: mockUsersRepo },
                { provide: getModelToken(Rates), useValue: mockRatesRepo },
                { provide: getModelToken(UserLimits), useValue: mockUserLimitsRepo },
                { provide: getModelToken(Payments), useValue: mockPaymentsRepo },
                { provide: RolesService, useValue: mockRolesService },
                { provide: FilesService, useValue: mockFilesService },
                { provide: PricesService, useValue: mockPricesService },
                { provide: MailerService, useValue: mockMailerService },
                { provide: CurrencyService, useValue: mockCurrencyService },
                { provide: getModelToken(BalanceLedger), useValue: { findOne: jest.fn(), create: jest.fn() } },
                {
                    provide: getConnectionToken(),
                    useValue: {
                        transaction: jest.fn(async (cb: (t: { LOCK: { UPDATE: string } }) => Promise<void>) =>
                            cb({ LOCK: { UPDATE: 'UPDATE' } }),
                        ),
                    },
                },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    afterEach(() => {
        process.env.TENANT_CURRENCY = originalTenantCurrency;
    });

    // ═══════════════════════════════════════════════════════════════════
    // resolveOwnerId
    // ═══════════════════════════════════════════════════════════════════

    describe('resolveOwnerId', () => {
        it('should return user.id for root users (vpbx_user_id is null)', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 5, vpbx_user_id: null });

            const result = await service.resolveOwnerId('5');

            expect(result).toBe(5);
        });

        it('should return vpbx_user_id for sub-users', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 10, vpbx_user_id: 5 });

            const result = await service.resolveOwnerId('10');

            expect(result).toBe(5);
        });

        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue(null);

            await expect(service.resolveOwnerId('999'))
                .rejects.toThrow('User not found');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // updateUserBalance
    // ═══════════════════════════════════════════════════════════════════

    describe('updateUserBalance', () => {
        it('should return false when id and amount are both falsy', async () => {
            const result = await service.updateUserBalance('', 0);

            expect(result).toBe(false);
            expect(mockUsersRepo.increment).not.toHaveBeenCalled();
        });

        it('should resolve ownerId and increment balance', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 5, vpbx_user_id: null });

            const result = await service.updateUserBalance('5', 50);

            expect(mockUsersRepo.increment).toHaveBeenCalledWith('balance', {
                by: 50,
                where: { id: 5 },
            });
            expect(result).toBe(true);
        });

        it('should return false when no rows affected', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.increment.mockResolvedValue([{ length: 0 }]);

            const result = await service.updateUserBalance('1', 50);

            expect(result).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // decrementUserBalance (with threshold notifications)
    // ═══════════════════════════════════════════════════════════════════

    describe('decrementUserBalance', () => {
        it('should decrement balance by amount', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null }) // resolveOwnerId
                .mockResolvedValueOnce({ balance: 90, email: 'test@test.com' }); // after decrement

            await service.decrementUserBalance('1', 10);

            expect(mockUsersRepo.decrement).toHaveBeenCalledWith('balance', {
                by: 10,
                where: { id: 1 },
            });
        });

        it('should send low balance notification when crossing limit threshold', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: 8, email: 'user@test.com' });

            mockUserLimitsRepo.findOne.mockResolvedValue({
                limitAmount: 10,
                emails: ['admin@test.com'],
            });

            // oldBalanceApprox = 8 + 5 = 13 >= 10, newBalance = 8 < 10 → notification
            await service.decrementUserBalance('1', 5);

            expect(mockMailerService.sendLowBalanceNotification).toHaveBeenCalledWith(
                ['admin@test.com'],
                8,
                10,
            );
        });

        it('should send critical balance notification when crossing $3 threshold', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: 2.5, email: 'user@test.com' });

            mockUserLimitsRepo.findOne.mockResolvedValue(null);

            // oldBalanceApprox = 2.5 + 2 = 4.5 > 3, newBalance = 2.5 <= 3
            await service.decrementUserBalance('1', 2);

            expect(mockMailerService.sendCriticalBalanceNotification).toHaveBeenCalledWith(
                ['user@test.com'],
                2.5,
            );
        });

        it('should send zero balance notification when crossing $0 threshold', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: -1, email: 'user@test.com' });

            mockUserLimitsRepo.findOne.mockResolvedValue({
                emails: ['admin@test.com'],
            });

            // oldBalanceApprox = -1 + 5 = 4 > 0, newBalance = -1 <= 0
            await service.decrementUserBalance('1', 5);

            expect(mockMailerService.sendZeroBalanceNotification).toHaveBeenCalledWith(
                expect.arrayContaining(['admin@test.com', 'user@test.com']),
                -1,
            );
        });

        it('should NOT send notification when balance stays above threshold', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: 50, email: 'user@test.com' });

            mockUserLimitsRepo.findOne.mockResolvedValue({
                limitAmount: 10,
                emails: ['admin@test.com'],
            });

            await service.decrementUserBalance('1', 5);

            expect(mockMailerService.sendLowBalanceNotification).not.toHaveBeenCalled();
            expect(mockMailerService.sendCriticalBalanceNotification).not.toHaveBeenCalled();
            expect(mockMailerService.sendZeroBalanceNotification).not.toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // createSubUser
    // ═══════════════════════════════════════════════════════════════════

    describe('createSubUser', () => {
        it('should throw 404 when owner not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue(null);

            await expect(service.createSubUser(999, { email: 'sub@test.com' } as any))
                .rejects.toThrow('Owner user not found');
        });

        it('should throw 403 when sub-user tries to create another sub-user', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 10, vpbx_user_id: 5 });

            await expect(service.createSubUser(10, { email: 'sub@test.com' } as any))
                .rejects.toThrow('Sub-users cannot create other users');
        });

        it('should throw when email already exists', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.findOne.mockResolvedValue(mockUser); // email exists

            await expect(service.createSubUser(1, { email: 'test@example.com' } as any))
                .rejects.toThrow('User with this email already exists');
        });

        it('should create sub-user with vpbx_user_id pointing to owner', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null }) // owner check
                .mockResolvedValueOnce(mockUser); // findByPk after create for return
            mockUsersRepo.findOne.mockResolvedValue(null); // email not taken
            mockUsersRepo.create.mockResolvedValue({
                ...mockUser,
                id: 10,
                vpbx_user_id: 1,
                update: jest.fn().mockResolvedValue(undefined),
                $set: jest.fn().mockResolvedValue(undefined),
            });

            await service.createSubUser(1, { email: 'sub@test.com', name: 'Sub User' } as any);

            expect(mockUsersRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'sub@test.com',
                    vpbx_user_id: 1,
                    balance: 0,
                }),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // deleteUser
    // ═══════════════════════════════════════════════════════════════════

    describe('deleteUser', () => {
        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue(null);

            await expect(service.deleteUser(999)).rejects.toThrow('User not found');
        });

        it('should prevent deleting owner with sub-users', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.count.mockResolvedValue(3); // 3 sub-users

            await expect(service.deleteUser(1)).rejects.toThrow('Cannot delete owner');
        });

        it('should allow deleting owner with no sub-users', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.count.mockResolvedValue(0);

            const result = await service.deleteUser(1);

            expect(mockUsersRepo.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(result.statusCode).toBe(HttpStatus.OK);
        });

        it('should throw 403 when requester is not the owner of sub-user', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 10, vpbx_user_id: 5 });

            await expect(service.deleteUser(10, 99))
                .rejects.toThrow('Forbidden: not your sub-user');
        });

        it('should allow owner to delete their sub-user', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 10, vpbx_user_id: 5 });

            const result = await service.deleteUser(10, 5);

            expect(mockUsersRepo.destroy).toHaveBeenCalledWith({ where: { id: 10 } });
            expect(result.statusCode).toBe(HttpStatus.OK);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getUserBalance
    // ═══════════════════════════════════════════════════════════════════

    describe('getUserBalance', () => {
        it('should return balance in tenant currency with balanceUsd ledger', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.findOne.mockResolvedValue({ balance: 100, currency: 'USD' });

            const result = await service.getUserBalance('1');

            expect(result).toEqual({
                balance: 100,
                balanceUsd: 100,
                currency: 'USD',
                rate: 1,
            });
            expect(mockCurrencyService.convertFromUsd).toHaveBeenCalledWith(100, 'USD');
        });

        it('should convert balance to RUB when TENANT_CURRENCY=RUB', async () => {
            process.env.TENANT_CURRENCY = 'RUB';
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.findOne.mockResolvedValue({ balance: 10, currency: 'RUB' });

            const result = await service.getUserBalance('1');

            expect(result).toEqual({
                balance: 900,
                balanceUsd: 10,
                currency: 'RUB',
                rate: 90,
            });
            expect(mockCurrencyService.convertFromUsd).toHaveBeenCalledWith(10, 'RUB');
        });

        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.findOne.mockResolvedValue(null);

            await expect(service.getUserBalance('1')).rejects.toThrow('User not found');
        });

        it('should use convertFromUsd rate from CurrencyService', async () => {
            mockCurrencyService.convertFromUsd.mockResolvedValue({ amount: 55, rate: 1.1 });
            mockUsersRepo.findByPk.mockResolvedValue({ id: 1, vpbx_user_id: null });
            mockUsersRepo.findOne.mockResolvedValue({ balance: 50, currency: 'EUR' });

            const result = await service.getUserBalance('1');

            expect(result.balance).toBe(55);
            expect(result.balanceUsd).toBe(50);
            expect(result.rate).toBe(1.1);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // adminTopUpBalance
    // ═══════════════════════════════════════════════════════════════════

    describe('adminTopUpBalance', () => {
        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue(null);

            await expect(
                service.adminTopUpBalance({ userId: '999', amount: 100 } as any),
            ).rejects.toThrow('User not found');
        });

        it('should update balance and create payment record', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce(mockUser) // initial check
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null }) // resolveOwnerId
                .mockResolvedValueOnce({ balance: 200 }); // final balance

            const result = await service.adminTopUpBalance({
                userId: '1',
                amount: 100,
                currency: 'USD',
                paymentMethod: 'admin',
                paymentInfo: 'Test top-up',
            } as any);

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: '1',
                    amount: 100,
                    currency: 'USD',
                    status: 'succeeded',
                    paymentMethod: 'admin',
                }),
            );
            expect(result.message).toContain('Balance topped up');
        });

        it('should default currency to USD', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce(mockUser)
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: 150 });

            await service.adminTopUpBalance({
                userId: '1',
                amount: 50,
                paymentMethod: 'admin',
            } as any);

            expect(mockPaymentsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ currency: 'USD' }),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // setUsageLimit
    // ═══════════════════════════════════════════════════════════════════

    describe('setUsageLimit', () => {
        it('should create new limit when none exists', async () => {
            mockUserLimitsRepo.findOne.mockResolvedValue(null);

            await service.setUsageLimit({ userId: '1', limitAmount: 10, emails: ['admin@test.com'] });

            expect(mockUserLimitsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 1,
                    limitAmount: 10,
                    emails: ['admin@test.com'],
                }),
            );
        });

        it('should update existing limit', async () => {
            const existingLimit = { update: jest.fn().mockResolvedValue(undefined) };
            mockUserLimitsRepo.findOne.mockResolvedValue(existingLimit);

            await service.setUsageLimit({ userId: '1', limitAmount: 20, emails: ['new@test.com'] });

            expect(existingLimit.update).toHaveBeenCalledWith({
                limitAmount: 20,
                emails: ['new@test.com'],
            });
            expect(mockUserLimitsRepo.create).not.toHaveBeenCalled();
        });

        it('should throw for invalid userId', async () => {
            await expect(
                service.setUsageLimit({ userId: 'invalid', limitAmount: 10, emails: [] }),
            ).rejects.toThrow();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // getMe
    // ═══════════════════════════════════════════════════════════════════

    describe('getMe', () => {
        it('should throw 404 when id is empty', async () => {
            await expect(service.getMe('')).rejects.toThrow('User not found');
        });

        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findOne.mockResolvedValue(null);

            await expect(service.getMe('999')).rejects.toThrow('User not found');
        });
    });
});
