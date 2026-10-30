import { insightWindows } from './insight-periods';
import { verifiedInsights, verifiedRecommendations } from './verified-insights';
import type { InsightPeriodData, InsightMetricGroup } from './insight-evidence';

const periods = { current: { startDate: '2026-10-01', endDate: '2026-10-31' }, previous: { startDate: '2026-09-01', endDate: '2026-09-30' } };
const group = (patch: Partial<InsightMetricGroup> = {}): InsightMetricGroup => ({ metricId: 'booking', origin: 'custom', rule: { id: 'booking', origin: 'custom', name: 'Подтверждение записи', type: 'boolean', normalization: { kind: 'points', values: { true: 1, false: 0 }, maxPoints: 1 }, included: true, weight: 1, critical: 'none' }, status: 'assessed', category: 'true', n: 20, average: null, normalized: 50, trueCount: 10, lowIds: ['exact-low'], highIds: ['exact-high'], ...patch });
const data = (metrics = [group()], patch: Partial<InsightPeriodData> = {}): InsightPeriodData => ({ total: 20, scored: 20, score: 50, scorecards: ['rules'], coverage: 1, historical: 0, metrics, ...patch });

describe('verified insights', () => {
    it('includes custom criteria, valid denominators and exact metric-value exemplars', () => {
        const facts = verifiedInsights(data(), null, periods, {});
        expect(facts[0].evidence).toMatchObject({ metricId: 'booking', origin: 'custom', assessed: 20, applicable: 20, value: 50, unit: 'points', channelIds: ['exact-low'], distribution: { true: 10, false: 10 } });
        expect(facts[0].observation).toContain('20 из 20');
    });
    it('excludes N/A from the denominator and refuses missing-only/small samples', () => {
        const na = group({ status: 'not_applicable', n: 10 });
        expect(verifiedInsights(data([group(), na], { total: 30 }), null, periods, {})[0].evidence.applicable).toBe(20);
        expect(verifiedInsights(data([group({ status: 'missing' })], { scored: 0 }), null, periods, {})).toEqual([]);
        expect(verifiedInsights(data([group({ n: 4 })]), null, periods, {})).toEqual([]);
    });
    it('compares compatible custom scales, returns BOTH period exemplars, blocks changed rules', () => {
        const now = data([group({ normalized: 65 })]);
        const old = data([group({ normalized: 90, lowIds: ['previous-exact'] })]);
        const trend = verifiedInsights(now, old, periods, {}).find(f => f.type === 'trend')!;
        expect(trend.evidence).toMatchObject({ previousValue: 90, delta: -25, previousChannelIds: ['exact-high'], previousPeriod: periods.previous });
        expect(verifiedInsights(now, data([group({ rule: { ...group().rule, weight: 2 } })]), periods, {}).some(f => f.type === 'trend')).toBe(false);
    });
    it('preserves enum distributions and links only the reported category', () => {
        const rule = { ...group().rule, type: 'enum' as const, normalization: { kind: 'none' as const }, included: false };
        const facts = verifiedInsights(data([group({ rule, category: 'да', n: 12, normalized: null, lowIds: ['yes'] }), group({ rule, category: 'нет', n: 8, normalized: null, lowIds: ['no'] })]), null, periods, {});
        expect(facts[0].evidence).toMatchObject({ value: 60, unit: 'percent', distribution: { да: 12, нет: 8 }, channelIds: ['yes'] });
    });
    it('does not force a minimum and rejects model-generated figures, foreign IDs and reliability disclosures', () => {
        expect(verifiedInsights(data([group({ normalized: 80, category: null, trueCount: 0, rule: { ...group().rule, type: 'number' } })]), null, periods, {})).toEqual([]);
        const facts = verifiedInsights(data(), null, periods, {}), factId = facts[0].evidence.factId;
        for (const item of [{ factId: 'foreign', recommendation: 'Проверить диалоги' }, { factId, recommendation: 'Потери составили 95%' }, { factId, recommendation: 'Звонки ненадёжны из-за распознавания' }]) {
            expect(() => verifiedRecommendations({ insights: [item] }, facts)).toThrow();
        }
        expect(verifiedRecommendations({ insights: [] }, facts)).toEqual([]);
        expect(verifiedRecommendations({ insights: [{ factId, actionId: 'review' }] }, facts)[0].observation).toBe(facts[0].observation);
    });
});

describe('insight calendar periods', () => {
    it('compares full ISO local months, including different month lengths', () => {
        expect(insightWindows({ startDate: '2026-09-30T17:00:00.000Z', endDate: '2026-10-31T16:59:59.999Z', timezone: 'Asia/Krasnoyarsk' }, new Date('2026-12-01Z')).previous).toEqual({ startDate: '2026-08-31T17:00:00.000Z', endDate: '2026-09-30T16:59:59.999Z' });
    });
    it('clips current months and compares the same elapsed local part', () => {
        const result = insightWindows({ startDate: '2026-10-01', endDate: '2026-10-31', timezone: 'Asia/Krasnoyarsk' }, new Date('2026-10-15T03:30:00Z'));
        expect(result.current!.endDate).toBe('2026-10-15T03:30:00.000Z');
        expect(result.previous!.endDate).toBe('2026-09-15T03:30:00.000Z');
    });
    it('retains local calendar days across DST and previous calendar years', () => {
        const result = insightWindows({ startDate: '2026-03-29', endDate: '2026-03-29', timezone: 'Europe/Berlin' }, new Date('2026-04-01Z'));
        expect(result.current).toEqual({ startDate: '2026-03-28T23:00:00.000Z', endDate: '2026-03-29T21:59:59.999Z' });
        expect(result.previous).toEqual({ startDate: '2026-03-27T23:00:00.000Z', endDate: '2026-03-28T22:59:59.999Z' });
        expect(insightWindows({ startDate: '2024-01-01', endDate: '2024-12-31' }, new Date('2026-01-01Z')).previous).toEqual({ startDate: '2023-01-01T00:00:00.000Z', endDate: '2023-12-31T23:59:59.999Z' });
    });
    it('rejects invalid ranges/zones and does not query future-only periods', () => {
        expect(() => insightWindows({ timezone: 'invalid' })).toThrow();
        expect(() => insightWindows({ startDate: 'bad', endDate: 'bad' })).toThrow();
        expect(() => insightWindows({ startDate: '2026-02-31', endDate: '2026-03-01' })).toThrow();
        expect(insightWindows({ startDate: '2027-01-01', endDate: '2027-01-31' }, new Date('2026-01-01Z')).current).toBeNull();
    });
});
