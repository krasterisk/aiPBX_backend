import type { DigestReportWindow } from '../interfaces/digest-config.interface';

export function getDigestTimezone(): string {
    return process.env.TIMEZONE || process.env.TZ || 'UTC';
}

/** Parts of `date` in the given IANA timezone. */
export function zonedParts(date: Date, timeZone: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    /** ISO weekday 1=Mon … 7=Sun */
    isoWeekday: number;
} {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        weekday: 'short',
    }).formatToParts(date);

    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    const year = Number(get('year'));
    const month = Number(get('month'));
    const day = Number(get('day'));
    const hour = Number(get('hour'));
    const wd = get('weekday');
    const map: Record<string, number> = {
        Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
    };
    return { year, month, day, hour, isoWeekday: map[wd] ?? 1 };
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
    return `${year}-${pad(month)}-${pad(day)}`;
}

/** Add calendar days to a Y-M-D triple (naive, for window math in local calendar). */
function addDays(year: number, month: number, day: number, delta: number): { year: number; month: number; day: number } {
    const utc = new Date(Date.UTC(year, month - 1, day + delta));
    return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export interface DigestDateRange {
    startDate: string;
    endDate: string;
    label: string;
}

export function resolveDigestReportWindow(
    window: DigestReportWindow,
    now: Date = new Date(),
    timeZone: string = getDigestTimezone(),
    isRu = true,
): DigestDateRange {
    const z = zonedParts(now, timeZone);

    if (window === 'previous_calendar_month') {
        let year = z.year;
        let month = z.month - 1;
        if (month < 1) {
            month = 12;
            year -= 1;
        }
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const startDate = ymd(year, month, 1);
        const endDate = ymd(year, month, lastDay);
        const label = isRu
            ? `${pad(month)}.${year}`
            : `${year}-${pad(month)}`;
        return { startDate, endDate, label };
    }

    const days = window === 'last_30_days' ? 30 : 7;
    const end = { year: z.year, month: z.month, day: z.day };
    const start = addDays(z.year, z.month, z.day, -(days - 1));
    const startDate = ymd(start.year, start.month, start.day);
    const endDate = ymd(end.year, end.month, end.day);
    const label = isRu
        ? `${pad(start.day)}.${pad(start.month)}.${start.year} – ${pad(end.day)}.${pad(end.month)}.${end.year}`
        : `${startDate} – ${endDate}`;
    return { startDate, endDate, label };
}
