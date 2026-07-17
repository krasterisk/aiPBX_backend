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
import { BalanceThresholdAlertsService } from './balance-threshold-alerts.service';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';

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
    let mockBalanceThresholdAlertsService: {
        listForOwner: jest.Mock;
        processBalanceCrossing: jest.Mock;
    };
    let mockBalanceLedgerRepo: { findOne: jest.Mock; create: jest.Mock };
    let mockOurOrganizationsService: { getPrimaryId: jest.Mock };
    const originalTenantCurrency = process.env.TENANT_CURRENCY;

    const ledgerUser = (balance: number, email = 'user@test.com') => ({
        id: 1,
        balance,
        email,
        update: jest.fn().mockResolvedValue(undefined),
    });

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
        mockBalanceThresholdAlertsService = {
            listForOwner: jest.fn().mockResolvedValue([]),
            processBalanceCrossing: jest.fn().mockResolvedValue(undefined),
        };
        mockBalanceLedgerRepo = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
        };
        mockOurOrganizationsService = {
            getPrimaryId: jest.fn().mockResolvedValue(1),
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
                {
                    provide: BalanceThresholdAlertsService,
                    useValue: mockBalanceThresholdAlertsService,
                },
                { provide: OurOrganizationsService, useValue: mockOurOrganizationsService },
                { provide: getModelToken(BalanceLedger), useValue: mockBalanceLedgerRepo },
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

    describe('resolveTenantParentId', () => {
        it('should return null for empty values', async () => {
            await expect(service.resolveTenantParentId(null)).resolves.toBeNull();
            await expect(service.resolveTenantParentId(undefined)).resolves.toBeNull();
            await expect(service.resolveTenantParentId('')).resolves.toBeNull();
        });

        it('should return owner id when selecting a root tenant', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 7, vpbx_user_id: null });

            await expect(service.resolveTenantParentId(7)).resolves.toBe(7);
        });

        it('should reject sub-user as tenant parent', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 10, vpbx_user_id: 5 });

            await expect(service.resolveTenantParentId(10))
                .rejects.toThrow('Selected user is not a tenant owner');
        });

        it('should throw when tenant owner not found', async () => {
            mockUsersRepo.findByPk.mockResolvedValue(null);

            await expect(service.resolveTenantParentId(999))
                .rejects.toThrow('Tenant owner not found');
        });
    });

    describe('assertAdminTenantReassignment', () => {
        it('should block demoting owner with sub-users', async () => {
            mockUsersRepo.count.mockResolvedValue(2);

            await expect(
                service.assertAdminTenantReassignment(
                    { id: 1, vpbx_user_id: null } as any,
                    5,
                ),
            ).rejects.toThrow('Cannot demote owner');
        });

        it('should allow demoting owner with no sub-users', async () => {
            mockUsersRepo.count.mockResolvedValue(0);

            await expect(
                service.assertAdminTenantReassignment(
                    { id: 1, vpbx_user_id: null } as any,
                    5,
                ),
            ).resolves.toBe(5);
        });

        it('should reject self as parent', async () => {
            await expect(
                service.assertAdminTenantReassignment(
                    { id: 5, vpbx_user_id: null } as any,
                    5,
                ),
            ).rejects.toThrow('User cannot be a sub-user of themselves');
        });
    });

    describe('assertCanManageTenantUsers', () => {
        it('should allow tenant owner', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 5, vpbx_user_id: null, canManageUsers: false });
            await expect(service.assertCanManageTenantUsers(5)).resolves.toBe(5);
        });

        it('should allow sub-user with canManageUsers', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 8, vpbx_user_id: 5, canManageUsers: true });
            await expect(service.assertCanManageTenantUsers(8)).resolves.toBe(5);
        });

        it('should reject sub-user without canManageUsers', async () => {
            mockUsersRepo.findByPk.mockResolvedValue({ id: 8, vpbx_user_id: 5, canManageUsers: false });
            await expect(service.assertCanManageTenantUsers(8))
                .rejects.toThrow('Forbidden: no permission to manage tenant users');
        });
    });

    describe('getTenantManagerEmails', () => {
        it('should return emails of managers', async () => {
            mockUsersRepo.findAll.mockResolvedValue([
                { email: 'Mgr@Example.com' },
                { email: 'other@test.com' },
            ]);
            await expect(service.getTenantManagerEmails(5)).resolves.toEqual([
                'mgr@example.com',
                'other@test.com',
            ]);
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
            const user = ledgerUser(100);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 5, vpbx_user_id: null })
                .mockResolvedValueOnce(user);

            const result = await service.updateUserBalance('5', 50);

            expect(user.update).toHaveBeenCalledWith({ balance: 150 }, expect.any(Object));
            expect(result).toBe(true);
        });

        it('should return false when no rows affected', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(null);

            const result = await service.updateUserBalance('1', 50);

            expect(result).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // decrementUserBalance (with threshold notifications)
    // ═══════════════════════════════════════════════════════════════════

    describe('decrementUserBalance', () => {
        beforeEach(() => {
            mockBalanceThresholdAlertsService.listForOwner.mockResolvedValue([]);
            mockBalanceThresholdAlertsService.processBalanceCrossing.mockResolvedValue(undefined);
            mockUsersRepo.findAll.mockResolvedValue([]);
        });

        it('should decrement balance via user.update inside transaction', async () => {
            const user = ledgerUser(100);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(user);

            await service.decrementUserBalance('1', 10);

            expect(user.update).toHaveBeenCalledWith({ balance: 90 }, expect.any(Object));
        });

        it('should delegate threshold crossing to BalanceThresholdAlertsService', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(13));

            await service.decrementUserBalance('1', 5);

            expect(mockBalanceThresholdAlertsService.processBalanceCrossing).toHaveBeenCalledWith(
                1,
                13,
                8,
            );
        });

        it('should send critical balance notification when crossing $3 threshold', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(4.5));

            await service.decrementUserBalance('1', 2);

            expect(mockMailerService.sendCriticalBalanceNotification).toHaveBeenCalledWith(
                ['user@test.com'],
                2.5,
            );
        });

        it('should include canManageUsers emails in critical notification', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(4.5));
            mockUsersRepo.findAll.mockResolvedValue([{ email: 'manager@tenant.com' }]);

            await service.decrementUserBalance('1', 2);

            expect(mockMailerService.sendCriticalBalanceNotification).toHaveBeenCalledWith(
                expect.arrayContaining(['user@test.com', 'manager@tenant.com']),
                2.5,
            );
        });

        it('should send zero balance notification when crossing $0 threshold', async () => {
            mockBalanceThresholdAlertsService.listForOwner.mockResolvedValue([
                { emails: ['admin@test.com'] },
            ]);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(4));

            await service.decrementUserBalance('1', 5);

            expect(mockMailerService.sendZeroBalanceNotification).toHaveBeenCalledWith(
                expect.arrayContaining(['admin@test.com', 'user@test.com']),
                -1,
            );
        });

        it('should not call critical/zero mailers when balance stays high', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(50));

            await service.decrementUserBalance('1', 5);

            expect(mockMailerService.sendCriticalBalanceNotification).not.toHaveBeenCalled();
            expect(mockMailerService.sendZeroBalanceNotification).not.toHaveBeenCalled();
        });

        it('should not send balance alerts when tenant is already blocked (balance ≤ 0)', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(ledgerUser(-3));

            await service.decrementUserBalance('1', 2);

            expect(mockBalanceThresholdAlertsService.processBalanceCrossing).not.toHaveBeenCalled();
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

        it('should throw 403 when requester cannot manage tenant users', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 10, vpbx_user_id: 5 }) // target
                .mockResolvedValueOnce({ id: 99, vpbx_user_id: 5, canManageUsers: false }); // requester

            await expect(service.deleteUser(10, 99))
                .rejects.toThrow('Forbidden: no permission to manage tenant users');
        });

        it('should allow owner to delete their sub-user', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 10, vpbx_user_id: 5 }) // target
                .mockResolvedValueOnce({ id: 5, vpbx_user_id: null, canManageUsers: false }); // owner

            const result = await service.deleteUser(10, 5);

            expect(mockUsersRepo.destroy).toHaveBeenCalledWith({ where: { id: 10 } });
            expect(result.statusCode).toBe(HttpStatus.OK);
        });

        it('should allow manager to delete sibling sub-user', async () => {
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 10, vpbx_user_id: 5 }) // target
                .mockResolvedValueOnce({ id: 8, vpbx_user_id: 5, canManageUsers: true }); // manager

            const result = await service.deleteUser(10, 8);

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
                personalAccountNumber: null,
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
                personalAccountNumber: null,
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
            const user = ledgerUser(100);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce(mockUser)
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce({ balance: 200 });

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
            const user = ledgerUser(100);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce(mockUser)
                .mockResolvedValueOnce({ id: 1, vpbx_user_id: null })
                .mockResolvedValueOnce(user)
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
    // getUserById
    // ═══════════════════════════════════════════════════════════════════

    describe('getUserById', () => {
        it('should throw 404 when user not found', async () => {
            mockUsersRepo.findOne.mockResolvedValue(null);

            await expect(service.getUserById('999', '1', true)).rejects.toThrow('User not found');
        });

        it('should return user for admin even when owner balance lookup fails', async () => {
            const subUser = {
                ...mockUser,
                id: 115,
                vpbx_user_id: 5,
                setDataValue: jest.fn(),
            };
            mockUsersRepo.findOne.mockResolvedValue(subUser);
            mockUsersRepo.findByPk.mockResolvedValue(null);

            const result = await service.getUserById('115', '1', true);

            expect(result.id).toBe(115);
        });

        it('should throw 403 for non-admin without access', async () => {
            mockUsersRepo.findOne.mockResolvedValue({ ...mockUser, id: 99, vpbx_user_id: 5 });

            await expect(service.getUserById('99', '1', false)).rejects.toThrow('Editing Forbidden');
        });

        it('should allow owner to load their sub-user', async () => {
            const subUser = {
                ...mockUser,
                id: 115,
                vpbx_user_id: 5,
                setDataValue: jest.fn(),
            };
            mockUsersRepo.findOne.mockResolvedValue(subUser);
            mockUsersRepo.findByPk
                .mockResolvedValueOnce({ id: 5, vpbx_user_id: null })
                .mockResolvedValueOnce({ balance: 50, currency: 'USD' });

            const result = await service.getUserById('115', '5', false);

            expect(result.id).toBe(115);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // updateUser
    // ═══════════════════════════════════════════════════════════════════

    describe('updateUser', () => {
        it('should not persist client personalAccountNumber or balance on sub-user echo-back', async () => {
            const subUser = {
                ...mockUser,
                id: 99,
                vpbx_user_id: 95,
                balance: 0,
                currency: 'USD',
                personalAccountNumber: null,
                canManageUsers: false,
                update: jest.fn().mockResolvedValue(undefined),
                reload: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersRepo.findByPk.mockResolvedValue(subUser);
            jest.spyOn(service as any, 'resolveTenantParentId').mockResolvedValue(95);
            jest.spyOn(service as any, 'assertAdminTenantReassignment').mockResolvedValue(95);

            await service.updateUser(
                {
                    id: 99,
                    name: 'test',
                    balance: 4133.65,
                    currency: 'RUB',
                    vpbx_user_id: 95,
                    personalAccountNumber: 'AIPBX-00000095',
                    canManageUsers: true,
                },
                true,
            );

            const payload = subUser.update.mock.calls[0][0];
            expect(payload.canManageUsers).toBe(true);
            expect(payload.currency).toBe('RUB');
            expect(payload).not.toHaveProperty('personalAccountNumber');
            expect(payload).not.toHaveProperty('balance');
        });

        it('should assign personalAccountNumber when admin promotes user to owner', async () => {
            const subUser = {
                ...mockUser,
                id: 99,
                vpbx_user_id: 95,
                personalAccountNumber: null,
                canManageUsers: true,
                update: jest.fn().mockResolvedValue(undefined),
                reload: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersRepo.findByPk
                .mockResolvedValueOnce(subUser)
                .mockResolvedValueOnce(null); // resolveTenantParentId / assert path may call findByPk

            // assertAdminTenantReassignment needs parent resolution — mock owner-null path
            jest.spyOn(service as any, 'resolveTenantParentId').mockResolvedValue(null);
            jest.spyOn(service as any, 'assertAdminTenantReassignment').mockResolvedValue(null);

            await service.updateUser(
                {
                    id: 99,
                    vpbx_user_id: null,
                    personalAccountNumber: 'AIPBX-SHOULD-IGNORE',
                },
                true,
            );

            const payload = subUser.update.mock.calls[0][0];
            expect(payload.vpbx_user_id).toBeNull();
            expect(payload.canManageUsers).toBe(false);
            expect(payload.personalAccountNumber).toMatch(/^AIPBX-/);
            expect(payload.personalAccountNumber).not.toBe('AIPBX-SHOULD-IGNORE');
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
