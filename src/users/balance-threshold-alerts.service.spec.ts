import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { HttpException } from '@nestjs/common';
import { BalanceThresholdAlertsService } from './balance-threshold-alerts.service';
import { BalanceThresholdAlert } from './balance-threshold-alert.model';
import { User } from './users.model';
import { Organization } from '../organizations/organizations.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyService } from '../currency/currency.service';
import { MailerService } from '../mailer/mailer.service';
import { InvoiceService } from '../accounting/invoice.service';

jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
}));

describe('BalanceThresholdAlertsService', () => {
    let service: BalanceThresholdAlertsService;

    const alertRepo = {
        findAll: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        destroy: jest.fn(),
    };
    const usersRepo = {
        findByPk: jest.fn(),
        findAll: jest.fn(),
    };
    const orgRepo = {
        findOne: jest.fn(),
    };
    const billingRecordRepo = {
        findAll: jest.fn(),
    };
    const currencyService = {
        convertFromUsd: jest.fn(),
    };
    const mailerService = {
        sendLowBalanceNotification: jest.fn().mockResolvedValue(undefined),
    };
    const invoiceService = {
        issueInvoice: jest.fn(),
    };

    const alertRow = {
        id: 1,
        ownerUserId: 10,
        limitAmount: 100,
        emails: ['a@b.com'],
        notifyUserIds: [],
        sendInvoice: false,
        organizationId: null,
        invoiceAmountMode: 'average_monthly',
        invoiceAmountRub: null,
        sendViaEdo: false,
        update: jest.fn().mockResolvedValue(undefined),
    } as unknown as BalanceThresholdAlert;

    beforeEach(async () => {
        jest.clearAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [
                BalanceThresholdAlertsService,
                { provide: getModelToken(BalanceThresholdAlert), useValue: alertRepo },
                { provide: getModelToken(User), useValue: usersRepo },
                { provide: getModelToken(Organization), useValue: orgRepo },
                { provide: getModelToken(BillingRecord), useValue: billingRecordRepo },
                { provide: CurrencyService, useValue: currencyService },
                { provide: MailerService, useValue: mailerService },
                { provide: InvoiceService, useValue: invoiceService },
            ],
        }).compile();

        service = moduleRef.get(BalanceThresholdAlertsService);
    });

    describe('create', () => {
        it('normalizes emails and stores alert', async () => {
            orgRepo.findOne.mockResolvedValue({ id: 5 });
            alertRepo.create.mockImplementation(async (data) => data);

            const created = await service.create(10, {
                limitAmount: 50,
                emails: ['  A@B.COM ', 'a@b.com', ''],
                sendInvoice: true,
                organizationId: 5,
                invoiceAmountRub: 1000,
            });

            expect(created.emails).toEqual(['a@b.com']);
            expect(created.sendInvoice).toBe(true);
        });

        it('requires organization when sendInvoice is enabled', async () => {
            await expect(
                service.create(10, {
                    limitAmount: 50,
                    emails: ['a@b.com'],
                    sendInvoice: true,
                }),
            ).rejects.toBeInstanceOf(HttpException);
        });
    });

    describe('enrichEmailsFromUserIds', () => {
        it('merges user emails', async () => {
            usersRepo.findAll.mockResolvedValue([
                { email: 'User@Tenant.com' },
            ]);

            const emails = await service.enrichEmailsFromUserIds([2], ['notify@test.com']);

            expect(emails).toEqual(['notify@test.com', 'user@tenant.com']);
        });
    });

    describe('resolveInvoiceAmountRub', () => {
        it('uses fixed amount when mode is fixed', async () => {
            const amount = await service.resolveInvoiceAmountRub({
                invoiceAmountMode: 'fixed',
                invoiceAmountRub: 777,
                ownerUserId: 1,
            } as BalanceThresholdAlert);

            expect(amount).toBe(777);
        });

        it('uses average spend rounded to 50 when mode is average_monthly', async () => {
            usersRepo.findAll.mockResolvedValue([]);
            billingRecordRepo.findAll.mockResolvedValue([
                { totalCost: 0, amountCurrency: 120, currency: 'RUB' },
            ]);

            const amount = await service.resolveInvoiceAmountRub({
                invoiceAmountMode: 'average_monthly',
                ownerUserId: 1,
            } as BalanceThresholdAlert);

            expect(amount).toBe(150);
        });
    });

    describe('processBalanceCrossing', () => {
        it('sends notification when balance crosses threshold downward', async () => {
            alertRepo.findAll.mockResolvedValue([{ ...alertRow, sendInvoice: false }]);

            await service.processBalanceCrossing(10, 150, 80);

            expect(mailerService.sendLowBalanceNotification).toHaveBeenCalledWith(
                ['a@b.com'],
                80,
                100,
                undefined,
            );
            expect(alertRow.update).toHaveBeenCalled();
            expect(invoiceService.issueInvoice).not.toHaveBeenCalled();
        });

        it('does not notify when threshold was already below', async () => {
            alertRepo.findAll.mockResolvedValue([alertRow]);

            await service.processBalanceCrossing(10, 50, 40);

            expect(mailerService.sendLowBalanceNotification).not.toHaveBeenCalled();
        });

        it('issues invoice and attaches PDF when sendInvoice is enabled', async () => {
            const invoiceAlert = {
                ...alertRow,
                sendInvoice: true,
                organizationId: 5,
                invoiceAmountMode: 'fixed',
                invoiceAmountRub: 500,
            };
            alertRepo.findAll.mockResolvedValue([invoiceAlert]);
            invoiceService.issueInvoice.mockResolvedValue({
                number: 'AIPBX-00001',
                pdfRelativePath: 'org-documents/test.pdf',
            });

            await service.processBalanceCrossing(10, 200, 50);

            expect(invoiceService.issueInvoice).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 10,
                    organizationId: 5,
                    amountRub: 500,
                }),
                undefined,
            );
            expect(mailerService.sendLowBalanceNotification).toHaveBeenCalledWith(
                ['a@b.com'],
                50,
                100,
                expect.objectContaining({
                    filename: 'Schet_AIPBX-00001.pdf',
                    invoiceNumber: 'AIPBX-00001',
                }),
            );
        });
    });
});
