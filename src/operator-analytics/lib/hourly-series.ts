import { analyticsDate } from './analytics-date';

export interface HourlyPoint { label: string; callsCount: number; avgScore: number; avgDuration: number; }
interface SourceRecord { createdAt?: string | Date; duration?: number; analytics?: { metrics?: Record<string, unknown> }; }
const HOUR = 3_600_000;
const MAX_BUCKETS = 26; // One selected day, including DST and partial boundary hours.
const METRICS = ['greeting_quality', 'script_compliance', 'politeness_empathy', 'active_listening', 'objection_handling', 'product_knowledge', 'problem_resolution', 'speech_clarity_pace', 'closing_quality'];

/** Additive UTC buckets. Zero-fill gaps, bound response size, and never widen the selected range. */
export function buildHourlySeries(records: SourceRecord[], startDate?: string, endDate?: string): HourlyPoint[] {
    if (!records.length) return [];
    const dated = records.map(record => ({ record, at: record.createdAt == null ? NaN : new Date(record.createdAt).getTime() })).filter(item => Number.isFinite(item.at));
    if (!dated.length) return [];
    const times = dated.map(item => item.at);
    const from = startDate ? analyticsDate(startDate, 'start').getTime() : times.reduce((min, at) => Math.min(min, at), Infinity);
    const to = endDate ? analyticsDate(endDate, 'end').getTime() : times.reduce((max, at) => Math.max(max, at), -Infinity);
    const first = Math.floor(from / HOUR) * HOUR;
    const count = Math.floor(to / HOUR) - Math.floor(from / HOUR) + 1;
    if (to - from > 25 * HOUR || count < 1 || count > MAX_BUCKETS) return [];
    const buckets = Array.from({ length: count }, (_, index) => ({ label: new Date(first + index * HOUR).toISOString(), calls: 0, score: 0, duration: 0 }));
    for (const { record, at } of dated) {
        if (at < from || at > to) continue;
        const bucket = buckets[Math.floor(at / HOUR) - Math.floor(from / HOUR)];
        if (!bucket) continue;
        bucket.calls++;
        bucket.duration += Number(record.duration) || 0;
        bucket.score += METRICS.reduce((sum, key) => {
            const value = record.analytics?.metrics?.[key];
            return sum + (typeof value === 'number' && Number.isFinite(value) ? value : 0);
        }, 0) / METRICS.length;
    }
    return buckets.map(bucket => ({ label: bucket.label, callsCount: bucket.calls,
        avgScore: bucket.calls ? Number((bucket.score / bucket.calls).toFixed(2)) : 0,
        avgDuration: bucket.calls ? Number((bucket.duration / bucket.calls).toFixed(2)) : 0 }));
}
