import {
    calcDailyBurnUsd,
    calcDaysRemaining,
    calcRunwayInvoiceAmountRub,
    readBalanceRunwayConfig,
    shouldNotifyRunway,
} from './billing-runway.util';

describe('billing-runway.util', () => {
    it('calcDailyBurnUsd divides spend by lookback', () => {
        expect(calcDailyBurnUsd(70, 7)).toBe(10);
        expect(calcDailyBurnUsd(0, 7)).toBe(0);
    });

    it('calcDaysRemaining returns null when no burn', () => {
        expect(calcDaysRemaining(50, 0)).toBeNull();
        expect(calcDaysRemaining(50, 10)).toBe(5);
    });

    it('shouldNotifyRunway respects cooldown', () => {
        const config = readBalanceRunwayConfig();
        const recent = { lastNotifiedAt: new Date(), lastForecastDays: 5 };
        expect(shouldNotifyRunway(5, config, recent)).toBe(false);
        expect(shouldNotifyRunway(2, config, recent)).toBe(true);
    });

    it('calcRunwayInvoiceAmountRub rounds to 50', () => {
        expect(calcRunwayInvoiceAmountRub(4)).toBe(150);
    });
});
