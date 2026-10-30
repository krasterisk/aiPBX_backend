export interface InsightWindow { startDate: string; endDate: string }
const DAY = 86400000;
interface LocalTime { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number }
function local(date: Date, zone: string): LocalTime {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const p = Object.fromEntries(parts.map(p => [p.type, Number(p.value)]));
    return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second, ms: date.getUTCMilliseconds() };
}
const wall = (p: LocalTime) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms);
function instant(p: LocalTime, zone: string): Date {
    let value = wall(p);
    for (let i = 0; i < 4; i++) {
        const delta = wall(p) - wall(local(new Date(value), zone));
        if (!delta) return new Date(value);
        value += delta;
    }
    throw new Error('Local time does not exist in this timezone');
}
function shift(p: LocalTime, days: number): LocalTime {
    const d = new Date(wall(p) + days * DAY);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: p.hour, minute: p.minute, second: p.second, ms: p.ms };
}
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
function monthShift(p: LocalTime, months: number): LocalTime {
    const d = new Date(Date.UTC(p.year, p.month - 1 + months, 1));
    return { ...p, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: Math.min(p.day, daysIn(d.getUTCFullYear(), d.getUTCMonth() + 1)) };
}

/** Calendar bounds are interpreted in the browser's IANA zone, never by slicing UTC dates. */
export function insightWindows(query: { startDate?: string; endDate?: string; timezone?: string }, now = new Date()) {
    const timezone = query.timezone || 'UTC';
    // Also validates the zone on empty queries.
    local(now, timezone);
    if (!query.startDate || !query.endDate) throw new Error('Insight period is required');
    const parse = (s: string, end: boolean) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);
        const year = +s.slice(0, 4), month = +s.slice(5, 7), day = +s.slice(8, 10);
        if (month < 1 || month > 12 || day < 1 || day > daysIn(year, month)) throw new Error('Invalid calendar date');
        return instant({ year, month, day, hour: end ? 23 : 0, minute: end ? 59 : 0, second: end ? 59 : 0, ms: end ? 999 : 0 }, timezone);
    };
    const from = parse(query.startDate, false), selectedEnd = parse(query.endDate, true);
    if (!Number.isFinite(+from) || !Number.isFinite(+selectedEnd) || +selectedEnd < +from) throw new Error('Invalid insight period');
    const start = local(from, timezone), end = local(selectedEnd, timezone);
    const clippedEnd = new Date(Math.min(+selectedEnd, +now));
    if (+clippedEnd < +from) return { timezone, current: null, previous: null };
    const wholeStart = start.hour === 0 && start.minute === 0 && start.second === 0 && start.ms === 0;
    const wholeEnd = end.hour === 23 && end.minute === 59 && end.second === 59 && end.ms === 999;
    const fullYear = wholeStart && wholeEnd && start.month === 1 && start.day === 1 && end.month === 12 && end.day === 31 && start.year === end.year;
    const fullMonth = wholeStart && wholeEnd && start.day === 1 && end.day === daysIn(end.year, end.month) && start.month === end.month && start.year === end.year;
    const shiftMonths = fullYear ? -12 : fullMonth ? -1 : null;
    const length = Math.round((Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY) + 1;
    const move = (p: LocalTime) => shiftMonths == null ? shift(p, -length) : monthShift(p, shiftMonths);
    const previousStart = instant(move(start), timezone);
    let previousEnd = instant(move(local(clippedEnd, timezone)), timezone);
    if (+clippedEnd === +selectedEnd && (fullMonth || fullYear)) {
        const previousLocal = move(end);
        previousEnd = instant({ ...previousLocal, day: daysIn(previousLocal.year, previousLocal.month) }, timezone);
    }
    const current: InsightWindow = { startDate: from.toISOString(), endDate: clippedEnd.toISOString() };
    const previous: InsightWindow = { startDate: previousStart.toISOString(), endDate: previousEnd.toISOString() };
    return { timezone, current, previous };
}
