export interface AlertRuleCsatDrop {
    enabled: boolean;
    dropPct: number;
    windowDays: number;
    minCalls: number;
}

export interface AlertRuleNegativeSpike {
    enabled: boolean;
    spikePp: number;
    windowDays: number;
    minCalls: number;
}

export interface AlertRuleBudgetExceeded {
    enabled: boolean;
}

export interface AlertConfig {
    enabled: boolean;
    inheritRecipientsFromDigest: boolean;
    emails: string[];
    telegramChatIds: string[];
    csatDrop: AlertRuleCsatDrop;
    negativeSpike: AlertRuleNegativeSpike;
    budgetExceeded: AlertRuleBudgetExceeded;
    lastTestSentAt?: string | null;
}

function envNum(name: string, fallback: number): number {
    const n = Number(process.env[name]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function defaultAlertConfigFromEnv(): AlertConfig {
    return {
        enabled: false,
        inheritRecipientsFromDigest: true,
        emails: [],
        telegramChatIds: [],
        csatDrop: {
            enabled: true,
            dropPct: envNum('OPERATOR_ANOMALY_CSAT_DROP_PCT', 20),
            windowDays: envNum('OPERATOR_ANOMALY_WINDOW_DAYS', 7),
            minCalls: envNum('OPERATOR_ANOMALY_MIN_CALLS', 5),
        },
        negativeSpike: {
            enabled: true,
            spikePp: envNum('OPERATOR_ANOMALY_NEGATIVE_SPIKE_PCT', 15),
            windowDays: envNum('OPERATOR_ANOMALY_WINDOW_DAYS', 7),
            minCalls: envNum('OPERATOR_ANOMALY_MIN_CALLS', 5),
        },
        budgetExceeded: { enabled: true },
        lastTestSentAt: null,
    };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeEmails(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(e => String(e).trim()).filter(Boolean).slice(0, 10);
}

function normalizeChatIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(e => String(e).trim()).filter(id => /^-?\d+$/.test(id)).slice(0, 10);
}

export function normalizeAlertConfig(raw: unknown): AlertConfig {
    const base = defaultAlertConfigFromEnv();
    if (!raw || typeof raw !== 'object') return base;
    const o = raw as Partial<AlertConfig> & {
        csatDrop?: Partial<AlertRuleCsatDrop>;
        negativeSpike?: Partial<AlertRuleNegativeSpike>;
        budgetExceeded?: Partial<AlertRuleBudgetExceeded>;
    };

    return {
        enabled: Boolean(o.enabled),
        inheritRecipientsFromDigest: o.inheritRecipientsFromDigest !== false,
        emails: normalizeEmails(o.emails),
        telegramChatIds: normalizeChatIds(o.telegramChatIds),
        csatDrop: {
            enabled: o.csatDrop?.enabled !== false,
            dropPct: clampInt(o.csatDrop?.dropPct, 1, 100, base.csatDrop.dropPct),
            windowDays: clampInt(o.csatDrop?.windowDays, 1, 90, base.csatDrop.windowDays),
            minCalls: clampInt(o.csatDrop?.minCalls, 1, 1000, base.csatDrop.minCalls),
        },
        negativeSpike: {
            enabled: o.negativeSpike?.enabled !== false,
            spikePp: clampInt(o.negativeSpike?.spikePp, 1, 100, base.negativeSpike.spikePp),
            windowDays: clampInt(o.negativeSpike?.windowDays, 1, 90, base.negativeSpike.windowDays),
            minCalls: clampInt(o.negativeSpike?.minCalls, 1, 1000, base.negativeSpike.minCalls),
        },
        budgetExceeded: {
            enabled: o.budgetExceeded?.enabled !== false,
        },
        lastTestSentAt: typeof o.lastTestSentAt === 'string' ? o.lastTestSentAt : null,
    };
}

export interface AlertRecipients {
    emails: string[];
    telegramChatIds: string[];
}

/** Resolve alert recipients; optionally inherit from digest; merge legacy budgetAlertEmails. */
export function resolveAlertRecipients(
    alertConfig: AlertConfig,
    digestEmails: string[],
    digestChatIds: string[],
    legacyBudgetEmails?: string[] | null,
): AlertRecipients {
    let emails = alertConfig.inheritRecipientsFromDigest
        ? [...digestEmails]
        : [...alertConfig.emails];
    let telegramChatIds = alertConfig.inheritRecipientsFromDigest
        ? [...digestChatIds]
        : [...alertConfig.telegramChatIds];

    if (legacyBudgetEmails?.length) {
        emails = Array.from(new Set([...emails, ...legacyBudgetEmails.map(e => String(e).trim()).filter(Boolean)]));
    }

    return {
        emails: emails.slice(0, 10),
        telegramChatIds: telegramChatIds.slice(0, 10),
    };
}
