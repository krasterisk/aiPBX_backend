import { analyticsDate } from './analytics-date';
import { buildHourlySeries } from './hourly-series';

describe('hourly analytics', () => {
    it('groups boundaries in UTC and zero-fills an empty hour', () => {
        const result = buildHourlySeries([{ createdAt: '2026-10-24T06:59:59Z', duration: 60 }, { createdAt: '2026-10-24T07:00:00Z', duration: 120 }], '2026-10-24T06:00:00Z', '2026-10-24T08:59:59Z');
        expect(result.map(p => [p.label, p.callsCount, p.avgDuration])).toEqual([
            ['2026-10-24T06:00:00.000Z', 1, 60], ['2026-10-24T07:00:00.000Z', 1, 120], ['2026-10-24T08:00:00.000Z', 0, 0],
        ]);
    });
    it('keeps exact timezone-offset limits without including out-of-range records', () => {
        const result = buildHourlySeries([{ createdAt: '2026-10-24T06:29:59Z' }, { createdAt: '2026-10-24T06:30:00Z' }, { createdAt: '2026-10-24T07:00:01Z' }], '2026-10-24T13:30:00+07:00', '2026-10-24T14:00:00+07:00');
        expect(result.map(p => p.callsCount)).toEqual([1, 0]);
    });
    it('preserves legacy date-only boundary semantics and rejects invalid input', () => {
        expect(analyticsDate('2026-10-24', 'end')).toEqual(new Date('2026-10-24T23:59:59'));
        expect(analyticsDate('2026-10-24T06:00:00.999Z', 'end').toISOString()).toBe('2026-10-24T06:00:00.999Z');
        expect(() => analyticsDate('bad', 'start')).toThrow('Invalid analytics date');
    });
    it('bounds long-period payloads and handles empty data', () => {
        expect(buildHourlySeries([{ createdAt: '2026-10-24T06:00:00Z' }], '2026-10-24', '2026-10-24')).toHaveLength(24);
        expect(buildHourlySeries([{ createdAt: '2026-10-24T06:00:00Z' }], '2026-10-24', '2026-10-25')).toEqual([]);
        expect(buildHourlySeries([], '2026-10-24', '2026-10-24')).toEqual([]);
        expect(buildHourlySeries([{ createdAt: '2026-01-01' }], '2026-01-01', '2026-12-31')).toEqual([]);
        expect(buildHourlySeries([{ createdAt: '2026-10-24T06:00:00Z' }], '2026-10-01', '2026-10-31')).toEqual([]);
    });
})
