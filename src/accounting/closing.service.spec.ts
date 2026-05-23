import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { getConnectionToken } from '@nestjs/sequelize';
import { ClosingService } from './closing.service';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyHistory } from './currency-history.model';
import { CurrencyService } from '../currency/currency.service';
import { DocumentCounterService } from './document-counter.service';
import { SbisService } from './sbis.service';
import { BillingFxService } from '../billing/billing-fx.service';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';
import { OrganizationEdoService } from '../organizations/organization-edo.service';
import { User } from '../users/users.model';
import { buildClosingDocumentNote } from './billing.constants';

jest.mock('../users/personal-account.util', () => ({
    ensureOwnerPersonalAccount: jest.fn().mockResolvedValue('AIPBX-00000042'),
}));

describe('ClosingService', () => {
    let service: ClosingService;
    let billingModel: { sum: jest.Mock };
    let billingFx: { backfillMissingForPeriod: jest.Mock };
    let docModel: {
        findOne: jest.Mock;
        findByPk: jest.Mock;
        update: jest.Mock;
        create: jest.Mock;
    };
    let sequelize: { transaction: jest.Mock };
    let sbis: {
        isConfigured: jest.Mock;
        createUpdDraft: jest.Mock;
        sendDocumentToEdo: jest.Mock;
    };

    const originalTenantCurrency = process.env.TENANT_CURRENCY;

    const mockOrg = {
        id: 1,
        userId: 42,
        name: 'Test LLC',
        tin: '7700000000',
        kpp: '770001001',
        legalForm: 'ul',
        edoInvitationStateCode: 7,
    } as Organization;

    beforeEach(async () => {
        process.env.TENANT_CURRENCY = 'RUB';

        billingModel = { sum: jest.fn() };
        billingFx = { backfillMissingForPeriod: jest.fn().mockResolvedValue(0) };
        docModel = {
            findOne: jest.fn().mockResolvedValue(null),
            findByPk: jest.fn().mockResolvedValue({ sbisAttemptCount: 0 }),
            update: jest.fn().mockResolvedValue([1]),
            create: jest.fn().mockImplementation((data) =>
                Promise.resolve({
                    id: 'doc-upd-1',
                    getDataValue: (k: string) => (k === 'id' ? 'doc-upd-1' : undefined),
                    update: jest.fn(),
                    ...data,
                }),
            ),
        };
        sequelize = {
            transaction: jest.fn().mockImplementation(async (cb: (t: unknown) => Promise<unknown>) => cb({})),
        };
        sbis = {
            isConfigured: jest.fn().mockReturnValue(true),
            createUpdDraft: jest.fn().mockResolvedValue({
                documentId: 'sbis-1',
                revisionId: 'rev-1',
                sbisNumber: '1',
                sbisUrl: 'https://sbis.test/doc',
            }),
            sendDocumentToEdo: jest.fn().mockResolvedValue({ stateCode: 'ok' }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClosingService,
                { provide: getModelToken(Organization), useValue: { findAll: jest.fn() } },
                { provide: getModelToken(OrganizationDocument), useValue: docModel },
                { provide: getModelToken(BillingRecord), useValue: billingModel },
                { provide: getModelToken(CurrencyHistory), useValue: { findOne: jest.fn() } },
                { provide: getModelToken(User), useValue: { findByPk: jest.fn().mockResolvedValue({ id: 42 }) } },
                {
                    provide: CurrencyService,
                    useValue: { convertToUsd: jest.fn().mockResolvedValue(0.011) },
                },
                {
                    provide: DocumentCounterService,
                    useValue: {
                        defaultSeries: () => 'AI',
                    },
                },
                { provide: SbisService, useValue: sbis },
                { provide: BillingFxService, useValue: billingFx },
                {
                    provide: OurOrganizationsService,
                    useValue: {
                        resolveIssuerForTenant: jest.fn().mockResolvedValue({
                            tin: '2465264296',
                            kpp: '246501001',
                            name: 'ООО КРАСТЕРИСК',
                            address: 'г. Красноярск',
                            legalForm: 'ul',
                            sbisCertThumbprint: 'abc',
                        }),
                    },
                },
                {
                    provide: OrganizationEdoService,
                    useValue: { assertEdoReady: jest.fn() },
                },
                { provide: getConnectionToken(), useValue: sequelize },
            ],
        }).compile();

        service = module.get(ClosingService);
        jest.spyOn(service as unknown as { rubPerUsd: () => Promise<number> }, 'rubPerUsd').mockResolvedValue(90);
    });

    afterEach(() => {
        process.env.TENANT_CURRENCY = originalTenantCurrency;
        jest.restoreAllMocks();
    });

    it('buildClosingDocumentNote includes personal account and period', () => {
        const note = buildClosingDocumentNote('AIPBX-1', '2026-04-01', '2026-04-30');
        expect(note).toContain('AIPBX-1');
        expect(note).toContain('01.04.2026');
        expect(note).toContain('30.04.2026');
    });

    it('skips when upd already exists for period', async () => {
        docModel.findOne.mockResolvedValue({
            id: 'existing',
            amountRub: '100.00',
            amountUsd: '1',
            fxRate: '100',
            sbisId: 'sbis-old',
        });

        const result = await service.closeForOrganization(mockOrg, {
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
        });

        expect(result.skipReason).toBe('already_exists');
        expect(billingModel.sum).not.toHaveBeenCalled();
    });

    it('dryRun returns amounts and note without INSERT', async () => {
        billingModel.sum.mockResolvedValueOnce(10).mockResolvedValueOnce(900);

        const result = await service.closeForOrganization(mockOrg, {
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
            dryRun: true,
        });

        expect(result.skipped).toBe(false);
        expect(result.amountRub).toBe(900);
        expect(result.note).toContain('AIPBX');
        expect(docModel.create).not.toHaveBeenCalled();
    });

    it('skips zero usage', async () => {
        billingModel.sum.mockResolvedValue(0);

        const result = await service.closeForOrganization(mockOrg, {
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
        });

        expect(result.skipReason).toBe('zero_usage');
    });

    it('creates upd document and enqueues SBIS draft', async () => {
        billingModel.sum.mockResolvedValueOnce(10).mockResolvedValueOnce(900);

        const result = await service.closeForOrganization(mockOrg, {
            periodFrom: '2026-04-01',
            periodTo: '2026-04-30',
            documentDate: '2026-05-01',
        });

        expect(result.documentId).toBeDefined();
        const updCreate = docModel.create.mock.calls.find((c) => c[0].type === 'upd');
        expect(updCreate).toBeDefined();
        expect(updCreate![0].amountRub).toBe('900.00');
        expect(updCreate![0].vatMode).toBe('none');

        await new Promise((r) => setImmediate(r));
        expect(sbis.createUpdDraft).toHaveBeenCalled();
    });
});
