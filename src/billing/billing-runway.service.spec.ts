import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BillingRunwayService } from './billing-runway.service';
import { User } from '../users/users.model';
import { Organization } from '../organizations/organizations.model';
import { BalanceThresholdAlert } from '../users/balance-threshold-alert.model';
import { BalanceRunwayNotification } from './balance-runway-notification.model';
import { BillingService } from './billing.service';
import { CurrencyService } from '../currency/currency.service';
import { MailerService } from '../mailer/mailer.service';
import { InvoiceService } from '../accounting/invoice.service';

jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
}));

describe('BillingRunwayService', () => {
    let service: BillingRunwayService;

    const usersRepo = {
        findAll: jest.fn(),
        findByPk: jest.fn(),
    };
    const orgRepo = { findOne: jest.fn() };
    const alertRepo = { findAll: jest.fn(), findOne: jest.fn() };
    const runwayNotifyRepo = { findByPk: jest.fn(), upsert: jest.fn() };
    const billingService = { sumTenantSpendUsd: jest.fn() };
    const currencyService = { convertFromUsd: jest.fn() };
    const mailerService = { sendBalanceRunwayNotification: jest.fn() };
    const invoiceService = { issueInvoice: jest.fn() };

    const envBackup = { ...process.env };

    beforeEach(async () => {
        jest.clearAllMocks();
        process.env = { ...envBackup, TENANT_CURRENCY: 'RUB', NODE_ENV: 'production' };

        const moduleRef = await Test.createTestingModule({
            providers: [
                BillingRunwayService,
                { provide: getModelToken(User), useValue: usersRepo },
                { provide: getModelToken(Organization), useValue: orgRepo },
                { provide: getModelToken(BalanceThresholdAlert), useValue: alertRepo },
                { provide: getModelToken(BalanceRunwayNotification), useValue: runwayNotifyRepo },
                { provide: BillingService, useValue: billingService },
                { provide: CurrencyService, useValue: currencyService },
                { provide: MailerService, useValue: mailerService },
                { provide: InvoiceService, useValue: invoiceService },
            ],
        }).compile();

        service = moduleRef.get(BillingRunwayService);
    });

    afterEach(() => {
        process.env = envBackup;
    });

    it('notifies owner when runway is within alert threshold', async () => {
        usersRepo.findAll
            .mockResolvedValueOnce([{ id: 1, email: 'owner@test.com', balance: 50 }])
            .mockResolvedValueOnce([]);
        billingService.sumTenantSpendUsd.mockResolvedValue(70);
        runwayNotifyRepo.findByPk.mockResolvedValue(null);
        alertRepo.findAll.mockResolvedValue([]);
        alertRepo.findOne.mockResolvedValue({ organizationId: 4 });
        orgRepo.findOne.mockResolvedValue(null);
        currencyService.convertFromUsd.mockResolvedValue({ amount: 900, rate: 90 });
        invoiceService.issueInvoice.mockResolvedValue({
            number: 'INV-1',
            pdfRelativePath: 'org-documents/x.pdf',
        });

        const result = await service.runDailyCheck();

        expect(result.notified).toBe(1);
        expect(mailerService.sendBalanceRunwayNotification).toHaveBeenCalled();
        expect(invoiceService.issueInvoice).toHaveBeenCalled();
        expect(runwayNotifyRepo.upsert).toHaveBeenCalled();
    });

    it('skips owners with zero or negative balance', async () => {
        usersRepo.findAll.mockResolvedValueOnce([
            { id: 1, email: 'blocked@test.com', balance: -1 },
        ]);

        const result = await service.runDailyCheck();

        expect(result.notified).toBe(0);
        expect(mailerService.sendBalanceRunwayNotification).not.toHaveBeenCalled();
        expect(billingService.sumTenantSpendUsd).not.toHaveBeenCalled();
    });

    it('skips when billing disabled on USD production', async () => {
        process.env.TENANT_CURRENCY = 'USD';
        process.env.NODE_ENV = 'production';

        const result = await service.runDailyCheck();

        expect(result.processed).toBe(0);
        expect(usersRepo.findAll).not.toHaveBeenCalled();
    });

    it('skips when BALANCE_RUNWAY_ENABLED=false', async () => {
        process.env.BALANCE_RUNWAY_ENABLED = 'false';

        const result = await service.runDailyCheck();

        expect(result.processed).toBe(0);
        expect(result.notified).toBe(0);
        expect(usersRepo.findAll).not.toHaveBeenCalled();
        expect(mailerService.sendBalanceRunwayNotification).not.toHaveBeenCalled();
    });
});
