import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BillingFxService, distributeProportional } from './billing-fx.service';
import { Rates } from '../currency/rates.model';
import { BillingRecord } from './billing-record.model';

jest.mock('./billing-record.model', () => ({
    BillingRecord: {
        findAll: jest.fn().mockResolvedValue([]),
    },
}));

describe('distributeProportional', () => {
    it('splits totalClient proportionally and preserves sum', () => {
        const out = distributeProportional(
            [
                { key: 'a', usd: 0.06 },
                { key: 'b', usd: 0.04 },
            ],
            10,
        );
        expect(out.a + out.b).toBeCloseTo(10, 4);
        expect(out.a).toBeCloseTo(6, 4);
        expect(out.b).toBeCloseTo(4, 4);
    });
});

describe('BillingFxService', () => {
    let service: BillingFxService;
    let ratesFindOne: jest.Mock;

    const originalEnv = process.env.TENANT_CURRENCY;

    beforeEach(async () => {
        ratesFindOne = jest.fn();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingFxService,
                { provide: getModelToken(Rates), useValue: { findOne: ratesFindOne } },
            ],
        }).compile();
        service = module.get(BillingFxService);
    });

    afterEach(() => {
        process.env.TENANT_CURRENCY = originalEnv;
    });

    it('returns identity snapshot for USD tenant', async () => {
        process.env.TENANT_CURRENCY = 'USD';
        const snap = await service.captureSnapshot(12.5);
        expect(snap.currency).toBe('USD');
        expect(snap.amountCurrency).toBe(12.5);
        expect(snap.rate).toBe(1);
        expect(snap.source).toBe('identity');
    });

    it('converts USD to RUB using rates table', async () => {
        process.env.TENANT_CURRENCY = 'RUB';
        ratesFindOne.mockImplementation(({ where }: { where: { currency: string } }) => {
            if (where.currency === 'RUB') return { rate: 90 };
            if (where.currency === 'USD') return { rate: 1 };
            return null;
        });
        const snap = await service.captureSnapshot(1);
        expect(snap.currency).toBe('RUB');
        expect(snap.amountCurrency).toBe(90);
        expect(snap.rate).toBe(90);
        expect(snap.source).toBe('rates');
    });

    it('returns missing when rate not found', async () => {
        process.env.TENANT_CURRENCY = 'RUB';
        ratesFindOne.mockResolvedValue(null);
        const snap = await service.captureSnapshot(5);
        expect(snap.source).toBe('missing');
        expect(snap.amountCurrency).toBeNull();
    });

    it('backfillAllMissing filters by userId when provided', async () => {
        (BillingRecord.findAll as jest.Mock).mockClear().mockResolvedValue([]);

        await service.backfillAllMissing(100, '42');

        expect(BillingRecord.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ userId: '42' }),
                limit: 100,
            }),
        );
    });

    it('backfillAllMissing omits userId filter when not provided', async () => {
        (BillingRecord.findAll as jest.Mock).mockClear().mockResolvedValue([]);

        await service.backfillAllMissing(50);

        const call = (BillingRecord.findAll as jest.Mock).mock.calls[0][0];
        expect(call.where.userId).toBeUndefined();
    });
});
