import { roundUpToNearest50Rub } from '../users/balance-alert-billing.util';

export interface BalanceRunwayConfig {
    lookbackDays: number;
    alertDays: number;
    notifyCooldownDays: number;
    renotifyDaysDrop: number;
}

const BALANCE_RUNWAY_DISABLED = new Set(['0', 'false', 'no', 'off', 'disabled']);

/** Global kill switch for daily runway cron, admin trigger, and runway emails/invoices. */
export function isBalanceRunwayEnabled(): boolean {
    const raw = (process.env.BALANCE_RUNWAY_ENABLED ?? 'true').trim().toLowerCase();
    return !BALANCE_RUNWAY_DISABLED.has(raw);
}

export function readBalanceRunwayConfig(): BalanceRunwayConfig {
    const lookbackDays = Math.max(1, parseInt(process.env.BALANCE_RUNWAY_LOOKBACK_DAYS || '7', 10) || 7);
    const alertDays = Math.max(0.1, parseFloat(process.env.BALANCE_RUNWAY_ALERT_DAYS || '7') || 7);
    const notifyCooldownDays = Math.max(
        1,
        parseInt(process.env.BALANCE_RUNWAY_NOTIFY_COOLDOWN_DAYS || '7', 10) || 7,
    );
    const renotifyDaysDrop = Math.max(
        0.5,
        parseFloat(process.env.BALANCE_RUNWAY_RENOTIFY_DAYS_DROP || '2') || 2,
    );
    return { lookbackDays, alertDays, notifyCooldownDays, renotifyDaysDrop };
}

export function calcDailyBurnUsd(spendUsd: number, lookbackDays: number): number {
    if (!Number.isFinite(spendUsd) || spendUsd <= 0 || lookbackDays <= 0) {
        return 0;
    }
    return spendUsd / lookbackDays;
}

export function calcDaysRemaining(balanceUsd: number, dailyBurnUsd: number): number | null {
    if (!Number.isFinite(balanceUsd) || balanceUsd <= 0) {
        return 0;
    }
    if (!Number.isFinite(dailyBurnUsd) || dailyBurnUsd <= 0) {
        return null;
    }
    return balanceUsd / dailyBurnUsd;
}

export function shouldNotifyRunway(
    daysLeft: number,
    config: BalanceRunwayConfig,
    last?: { lastNotifiedAt: Date; lastForecastDays: number } | null,
): boolean {
    if (daysLeft > config.alertDays) {
        return false;
    }
    if (!last) {
        return true;
    }
    const msSince = Date.now() - new Date(last.lastNotifiedAt).getTime();
    const cooldownMs = config.notifyCooldownDays * 24 * 60 * 60 * 1000;
    if (msSince >= cooldownMs) {
        return true;
    }
    if (last.lastForecastDays - daysLeft >= config.renotifyDaysDrop) {
        return true;
    }
    return false;
}

/** Invoice top-up for ~30 days at current burn rate (RUB). */
export function calcRunwayInvoiceAmountRub(dailyBurnRub: number): number {
    if (!Number.isFinite(dailyBurnRub) || dailyBurnRub <= 0) {
        return 50;
    }
    return roundUpToNearest50Rub(dailyBurnRub * 30);
}
