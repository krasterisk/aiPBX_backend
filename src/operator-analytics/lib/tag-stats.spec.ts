import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { buildTagStats, TAG_STATS_MAX_ENTRIES } from './tag-stats';

const numericMetrics = (overrides: Record<string, unknown> = {}) => ({
    greeting_quality: 80,
    script_compliance: 80,
    politeness_empathy: 80,
    active_listening: 80,
    objection_handling: 80,
    product_knowledge: 80,
    problem_resolution: 80,
    speech_clarity_pace: 80,
    closing_quality: 80,
    success: true,
    customer_sentiment: 'Positive',
    ...overrides,
});

const makeRecord = (
    tagIds: string[],
    tagNames: Record<string, string> = {},
    metricOverrides: Record<string, unknown> = {},
    sentiment = 'Positive',
): AiCdr => ({
    analytics: {
        sentiment,
        metrics: {
            ...numericMetrics(metricOverrides),
            _topics: { tags: tagIds, tag_names: tagNames },
        },
    },
} as AiCdr);

describe('tag-stats', () => {
    const taxonomy = [
        { id: 'billing', name: 'Счета', aliases: ['счёт'] },
        { id: 'returns', name: 'Возвраты', aliases: ['возврат'] },
    ];

    it('returns one entry per theme with correct call counts', () => {
        const records = [
            makeRecord(['billing'], { billing: 'Счета' }),
            makeRecord(['billing', 'returns'], { billing: 'Счета', returns: 'Возвраты' }),
            makeRecord(['returns'], { returns: 'Возвраты' }),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats).toHaveLength(2);
        const billing = stats.find(s => s.tagId === 'billing');
        const returns = stats.find(s => s.tagId === 'returns');
        expect(billing?.callsCount).toBe(2);
        expect(returns?.callsCount).toBe(2);
    });

    it('computes average score from scored calls carrying the theme', () => {
        const records = [
            makeRecord(['billing'], {}, { greeting_quality: 100, closing_quality: 100 }),
            makeRecord(['billing'], {}, { greeting_quality: 60, closing_quality: 60 }),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].averageScore).toBe(80);
    });

    it('computes successRate with guarded denominator and two-decimal rounding', () => {
        const records = [
            makeRecord(['billing'], {}, { success: true }),
            makeRecord(['billing'], {}, { success: false }),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].successRate).toBe(50);
    });

    it('reports sentiment counts from analytics.sentiment or customer_sentiment', () => {
        const records = [
            {
                analytics: {
                    sentiment: 'positive',
                    metrics: {
                        ...numericMetrics(),
                        _topics: { tags: ['billing'] },
                    },
                },
            } as AiCdr,
            {
                analytics: {
                    metrics: {
                        ...numericMetrics({ customer_sentiment: 'Neutral' }),
                        _topics: { tags: ['billing'] },
                    },
                },
            } as AiCdr,
            {
                analytics: {
                    metrics: {
                        ...numericMetrics({ customer_sentiment: 'Negative' }),
                        _topics: { tags: ['billing'] },
                    },
                },
            } as AiCdr,
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].sentiment).toEqual({ positive: 1, neutral: 1, negative: 1 });
    });

    it('yields zero derived numbers when no calls are scored for a theme', () => {
        const records = [{
            analytics: {
                metrics: { _topics: { tags: ['billing'] } },
            },
        } as AiCdr];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].averageScore).toBe(0);
        expect(stats[0].successRate).toBe(0);
        expect(stats[0].sentiment).toEqual({ positive: 0, neutral: 0, negative: 0 });
    });

    it('uses current taxonomy name when the theme is still present', () => {
        const records = [
            makeRecord(['billing'], { billing: 'Old label' }),
        ];
        const renamedTaxonomy = [{ id: 'billing', name: 'Счета (новое)', aliases: [] }];

        const stats = buildTagStats(records, renamedTaxonomy);
        expect(stats[0].name).toBe('Счета (новое)');
    });

    it('falls back to per-call name snapshot when theme was deleted from taxonomy', () => {
        const records = [
            makeRecord(['legacy'], { legacy: 'Устаревшая тема' }),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].name).toBe('Устаревшая тема');
    });

    it('falls back to tag identifier when absent from taxonomy and snapshots', () => {
        const records = [
            makeRecord(['orphan-id']),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].name).toBe('orphan-id');
    });

    it('orders by call count descending with alphabetical tie-break', () => {
        const records = [
            makeRecord(['returns']),
            makeRecord(['billing']),
            makeRecord(['billing']),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0].tagId).toBe('billing');
        expect(stats[1].tagId).toBe('returns');
    });

    it('uses alphabetical tie-break when call counts are equal', () => {
        const records = [
            makeRecord(['returns']),
            makeRecord(['billing']),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats.map(s => s.tagId)).toEqual(['returns', 'billing']);
    });

    it('caps the list at TAG_STATS_MAX_ENTRIES keeping highest-count themes', () => {
        const records: AiCdr[] = [];
        for (let i = 0; i < TAG_STATS_MAX_ENTRIES + 5; i++) {
            const tagId = `theme_${String(i).padStart(3, '0')}`;
            records.push(makeRecord([tagId]));
            if (i < 3) {
                records.push(makeRecord([tagId]));
            }
        }

        const stats = buildTagStats(records, []);
        expect(stats).toHaveLength(TAG_STATS_MAX_ENTRIES);
        expect(stats.every(s => s.callsCount >= 1)).toBe(true);
        const topTag = stats.find(s => s.tagId === 'theme_000');
        expect(topTag?.callsCount).toBe(2);
    });

    it('includes optional share and delta fields without replacing D-16 fields', () => {
        const records = [
            makeRecord(['billing'], {}, { greeting_quality: 90, closing_quality: 90 }),
            makeRecord(['returns'], {}, { greeting_quality: 70, closing_quality: 70 }),
        ];

        const stats = buildTagStats(records, taxonomy);
        expect(stats[0]).toMatchObject({
            tagId: expect.any(String),
            name: expect.any(String),
            callsCount: expect.any(Number),
            averageScore: expect.any(Number),
            successRate: expect.any(Number),
            sentiment: expect.objectContaining({
                positive: expect.any(Number),
                neutral: expect.any(Number),
                negative: expect.any(Number),
            }),
            shareOfPeriodCalls: 50,
        });
        expect(stats[0].deltaVsPeriodAverage).toBeDefined();
    });
});
