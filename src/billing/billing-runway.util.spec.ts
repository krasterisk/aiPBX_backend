import {
    calcDailyBurnUsd,
    calcDaysRemaining,
    calcRunwayInvoiceAmountRub,
    isBalanceRunwayEnabled,
    readBalanceRunwayConfig,
    shouldNotifyRunway,
} from './billing-runway.util';

describe('billing-runway.util', () => {
    const envBackup = { ...process.env };

    afterEach(() => {
        process.env = envBackup;
    });

    it.each(['false', 'FALSE', '0', 'no', 'off', 'disabled'])(
        'isBalanceRunwayEnabled is false when BALANCE_RUNWAY_ENABLED=%s',
        (value) => {
            process.env.BALANCE_RUNWAY_ENABLED = value;
            expect(isBalanceRunwayEnabled()).toBe(false);
        },
    );

    it('isBalanceRunwayEnabled defaults to true when unset', () => {
        delete process.env.BALANCE_RUNWAY_ENABLED;
        expect(isBalanceRunwayEnabled()).toBe(true);
    });

    it('isBalanceRunwayEnabled is true for explicit true', () => {
        process.env.BALANCE_RUNWAY_ENABLED = 'true';
        expect(isBalanceRunwayEnabled()).toBe(true);
    });
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
