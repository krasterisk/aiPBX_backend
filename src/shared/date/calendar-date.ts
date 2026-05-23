/** YYYY-MM-DD in server local timezone (avoids UTC shift from Date#toISOString). */
export function formatCalendarDateLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Previous full calendar month relative to `ref` (1st .. last day, local TZ). */
export function previousCalendarMonthPeriod(ref: Date = new Date()): {
    periodFrom: string;
    periodTo: string;
} {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const periodFrom = formatCalendarDateLocal(new Date(y, m - 1, 1));
    const periodTo = formatCalendarDateLocal(new Date(y, m, 0));
    return { periodFrom, periodTo };
}

export function todayCalendarDateLocal(): string {
    return formatCalendarDateLocal(new Date());
}
