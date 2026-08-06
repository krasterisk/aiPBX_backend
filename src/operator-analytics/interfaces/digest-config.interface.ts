export type DigestSchedule = 'daily' | 'weekly' | 'monthly';
export type DigestReportWindow = 'last_7_days' | 'last_30_days' | 'previous_calendar_month';

export interface DigestConfig {
    enabled: boolean;
    emails: string[];
    telegramChatIds: string[];
    schedule: DigestSchedule;
    reportWindow: DigestReportWindow;
    /** ISO weekday 1=Mon … 7=Sun (weekly). Default 1. */
    weeklyDay?: number;
    /** Day of month 1–28 (monthly). Default 1. */
    monthlyDay?: number;
    /** Hour 0–23 in digest TZ. Default 9. */
    sendHour?: number;
    lastSentAt?: string | null;
    lastManualSentAt?: string | null;
}

export const DEFAULT_DIGEST_CONFIG: DigestConfig = {
    enabled: false,
    emails: [],
    telegramChatIds: [],
    schedule: 'weekly',
    reportWindow: 'last_7_days',
    weeklyDay: 1,
    monthlyDay: 1,
    sendHour: 9,
    lastSentAt: null,
    lastManualSentAt: null,
};

export function normalizeDigestConfig(raw: unknown): DigestConfig {
    const base = { ...DEFAULT_DIGEST_CONFIG };
    if (!raw || typeof raw !== 'object') return base;
    const o = raw as Partial<DigestConfig>;
    const emails = Array.isArray(o.emails)
        ? o.emails.map(e => String(e).trim()).filter(Boolean).slice(0, 10)
        : [];
    const telegramChatIds = Array.isArray(o.telegramChatIds)
        ? o.telegramChatIds
            .map(e => String(e).trim())
            .filter(id => /^-?\d+$/.test(id))
            .slice(0, 10)
        : [];
    const schedule: DigestSchedule = (['daily', 'weekly', 'monthly'] as const).includes(o.schedule as DigestSchedule)
        ? (o.schedule as DigestSchedule)
        : 'weekly';
    const reportWindow: DigestReportWindow = (['last_7_days', 'last_30_days', 'previous_calendar_month'] as const)
        .includes(o.reportWindow as DigestReportWindow)
        ? (o.reportWindow as DigestReportWindow)
        : 'last_7_days';
    const weeklyDay = clampInt(o.weeklyDay, 1, 7, 1);
    const monthlyDay = clampInt(o.monthlyDay, 1, 28, 1);
    const sendHour = clampInt(o.sendHour, 0, 23, 9);
    return {
        enabled: Boolean(o.enabled),
        emails,
        telegramChatIds,
        schedule,
        reportWindow,
        weeklyDay,
        monthlyDay,
        sendHour,
        lastSentAt: typeof o.lastSentAt === 'string' ? o.lastSentAt : (o.lastSentAt === null ? null : null),
        lastManualSentAt: typeof o.lastManualSentAt === 'string'
            ? o.lastManualSentAt
            : (o.lastManualSentAt === null ? null : null),
    };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}
