import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { getConnectionToken } from '@nestjs/sequelize';
import { ClosingTask } from './closing.task';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyHistory } from './currency-history.model';
import { CurrencyService } from '../currency/currency.service';
import { DocumentCounterService } from './document-counter.service';
import { SbisService } from './sbis.service';
import { BillingFxService } from '../billing/billing-fx.service';

describe('ClosingTask', () => {
    let task: ClosingTask;
    let billingModel: { sum: jest.Mock; findOne: jest.Mock };
    let billingFx: { backfillMissingForPeriod: jest.Mock };
    let docModel: { findOne: jest.Mock; findAll: jest.Mock; create: jest.Mock };
    let sequelize: { transaction: jest.Mock };

    const originalTenantCurrency = process.env.TENANT_CURRENCY;

    const mockOrg = {
        id: 1,
        userId: 42,
        name: 'Test LLC',
        subject: 'Services',
    } as Organization;

    beforeEach(async () => {
        process.env.TENANT_CURRENCY = 'RUB';

        billingModel = {
            sum: jest.fn(),
            findOne: jest.fn(),
        };
        billingFx = {
            backfillMissingForPeriod: jest.fn().mockResolvedValue(0),
        };
        docModel = {
            findOne: jest.fn().mockResolvedValue(null),
            findAll: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockImplementation((data) =>
                Promise.resolve({ id: 'doc-1', update: jest.fn(), ...data }),
            ),
        };
        sequelize = {
            transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => Promise<void>) => {
                await cb({});
            }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClosingTask,
                { provide: getModelToken(Organization), useValue: { findAll: jest.fn() } },
                { provide: getModelToken(OrganizationDocument), useValue: docModel },
                { provide: getModelToken(BillingRecord), useValue: billingModel },
                { provide: getModelToken(CurrencyHistory), useValue: { findOne: jest.fn() } },
                {
                    provide: CurrencyService,
                    useValue: { convertToUsd: jest.fn().mockResolvedValue(0.011) },
                },
                {
                    provide: DocumentCounterService,
                    useValue: {
                        defaultSeries: () => 'AI',
                        nextNumber: jest.fn().mockResolvedValue(1),
                        formatDocumentNumber: () => 'AI-ACT-1',
                    },
                },
                {
                    provide: SbisService,
                    useValue: { enqueueDocument: jest.fn().mockResolvedValue({ ok: true }) },
                },
                { provide: BillingFxService, useValue: billingFx },
                { provide: getConnectionToken(), useValue: sequelize },
            ],
        }).compile();

        task = module.get(ClosingTask);
        jest.spyOn(task as any, 'rubPerUsd').mockResolvedValue(90);
    });

    afterEach(() => {
        process.env.TENANT_CURRENCY = originalTenantCurrency;
        jest.restoreAllMocks();
    });

    it('skips when act already exists for period', async () => {
        docModel.findOne.mockResolvedValue({ id: 'existing' });

        await (task as any).closeForOrganization(mockOrg, '2026-04-01', '2026-04-30', '2026-05-01');

        expect(billingModel.sum).not.toHaveBeenCalled();
        expect(billingFx.backfillMissingForPeriod).not.toHaveBeenCalled();
    });

    it('RUB tenant: backfills period and uses SUM(amountCurrency) for act amount', async () => {
        billingModel.sum
            .mockResolvedValueOnce(10) // usageUsd
            .mockResolvedValueOnce(900); // usageRub from amountCurrency

        await (task as any).closeForOrganization(mockOrg, '2026-04-01', '2026-04-30', '2026-05-01');

        expect(billingFx.backfillMissingForPeriod).toHaveBeenCalledWith('42', '2026-04-01', '2026-04-30');
        expect(billingModel.sum).toHaveBeenCalledWith('amountCurrency', expect.any(Object));

        const actCreate = docModel.create.mock.calls.find((c) => c[0].type === 'act');
        expect(actCreate).toBeDefined();
        expect(actCreate![0].amountRub).toBe('900.00');
        expect(actCreate![0].fxRate).toBe('90.000000');
    });

    it('USD tenant: converts usageUsd with rubPerUsd at closing date', async () => {
        process.env.TENANT_CURRENCY = 'USD';
        billingModel.sum.mockReset();
        billingModel.sum.mockResolvedValueOnce(10);

        await (task as any).closeForOrganization(mockOrg, '2026-04-01', '2026-04-30', '2026-05-01');

        expect(billingFx.backfillMissingForPeriod).not.toHaveBeenCalled();
        const actCreate = docModel.create.mock.calls.find((c) => c[0].type === 'act');
        expect(actCreate![0].amountRub).toBe('900.00');
        expect(actCreate![0].fxRate).toBe('90.000000');
    });
});
