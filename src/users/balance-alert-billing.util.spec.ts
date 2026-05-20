import { roundUpToNearest50Rub, sumTenantSpendLast30DaysRub } from './balance-alert-billing.util';

describe('balance-alert-billing.util', () => {
    describe('roundUpToNearest50Rub', () => {
        it('returns 50 for zero or invalid', () => {
            expect(roundUpToNearest50Rub(0)).toBe(50);
            expect(roundUpToNearest50Rub(-10)).toBe(50);
            expect(roundUpToNearest50Rub(Number.NaN)).toBe(50);
        });

        it('rounds up to nearest 50', () => {
            expect(roundUpToNearest50Rub(1)).toBe(50);
            expect(roundUpToNearest50Rub(120)).toBe(150);
            expect(roundUpToNearest50Rub(160)).toBe(200);
            expect(roundUpToNearest50Rub(200)).toBe(200);
        });
    });

    describe('sumTenantSpendLast30DaysRub', () => {
        const billingRecordRepository = {
            findAll: jest.fn(),
        } as any;
        const currencyService = {
            convertFromUsd: jest.fn(),
        } as any;

        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('sums RUB amountCurrency rows', async () => {
            billingRecordRepository.findAll.mockResolvedValue([
                { totalCost: 1, amountCurrency: 100, currency: 'RUB' },
                { totalCost: 2, amountCurrency: 50.5, currency: 'RUB' },
            ]);

            const sum = await sumTenantSpendLast30DaysRub(
                billingRecordRepository,
                currencyService,
                1,
                ['1', '2'],
            );

            expect(sum).toBe(150.5);
            expect(currencyService.convertFromUsd).not.toHaveBeenCalled();
        });

        it('converts USD rows via currency service', async () => {
            billingRecordRepository.findAll.mockResolvedValue([
                { totalCost: 10, amountCurrency: null, currency: 'USD' },
            ]);
            currencyService.convertFromUsd.mockResolvedValue({ amount: 900, rate: 90 });

            const sum = await sumTenantSpendLast30DaysRub(
                billingRecordRepository,
                currencyService,
                5,
                [],
            );

            expect(sum).toBe(900);
            expect(currencyService.convertFromUsd).toHaveBeenCalledWith(10, 'RUB');
        });
    });
});
