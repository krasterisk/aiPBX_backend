import {
    calculateQualityScore,
    createQualityScorecard,
    qualityHash,
    validateQualityConfig,
    averagePublishedQuality,
} from './quality-score';

const project = (criteria: any = {}) => ({
    id: 5,
    userId: '99',
    visibleDefaultMetrics: ['greeting_quality'],
    customMetricsSchema: [{ id: 'stars', type: 'number', name: 'Stars', min: 0, max: 5 }],
    qualityScoreConfig: { criteria },
});
const assessed = (values: Record<string, any>): Record<string, any> => ({
    ...values,
    _criterion_statuses: { 'default:greeting_quality': 'assessed', 'custom:stars': 'assessed' },
});
describe('canonical quality score', () => {
    it.each([false, true])('scores every applied criterion for operator 203 (legacy=%s), skipping null', (legacy) => {
        const custom = { greeting: false, introduction: false, clinic: false, name: false,
            branch: true, appointment: null, offer: false, source: null };
        const schema = Object.keys(custom).map(id => ({ id, type: 'boolean' }));
        const metrics = { politeness_empathy: 100, speech_clarity_pace: 100, custom_metrics: custom,
            _custom_meta: Object.fromEntries(schema.map(({ id, ...meta }) => [id, meta])),
            ...(!legacy ? { _criterion_statuses: Object.fromEntries([
                ['politeness_empathy', 'assessed'], ['speech_clarity_pace', 'assessed'],
                ...Object.entries(custom).map(([id, value]) => [id, value === null ? 'not_applicable' : 'assessed']),
            ]) } : {}) };
        const card = createQualityScorecard({ id: 5,
            visibleDefaultMetrics: ['politeness_empathy', 'speech_clarity_pace'], customMetricsSchema: schema,
        }, '99', { legacy, metrics });
        expect(calculateQualityScore(card, metrics)).toMatchObject({ score: 37.5, coverage: 1, assessed: 8, notApplicable: 2 });
    });
    it('keeps false and numeric zero in the mean but returns no score for all-null custom answers', () => {
        const card = createQualityScorecard({ id: 5 }, '99', { legacy: true, metrics: {
            _custom_meta: { check: { type: 'boolean' }, rating: { type: 'number', min: 0, max: 100 } },
        } });
        expect(calculateQualityScore(card, { custom_metrics: { check: false, rating: 0 } })).toMatchObject({ score: 0, assessed: 2 });
        expect(calculateQualityScore(card, { custom_metrics: { check: null, rating: null } })).toMatchObject({ score: null, assessed: 0, applicable: 0 });
    });
    it('normalizes explicit custom scales and weights, excluding CSAT, sentiment and business data', () => {
        const card = createQualityScorecard(project({ 'custom:stars': { included: true, weight: 3 } }), '99');
        const result = calculateQualityScore(
            card,
            assessed({ greeting_quality: 100, custom_metrics: { stars: 4, money: 100000 }, csat: 1, success: false })
        );
        expect(result.score).toBeCloseTo(85, 10);
        expect(result.coverage).toBe(1);
    });
    it('distinguishes N/A, missing, invalid, insufficient evidence and actual zero', () => {
        const card = createQualityScorecard(project({ 'custom:stars': { included: true } }), '99');
        const base = { greeting_quality: 100, custom_metrics: { stars: null } };
        expect(
            calculateQualityScore(card, {
                ...base,
                _criterion_statuses: { greeting_quality: 'assessed', stars: 'not_applicable' },
            })
        ).toEqual(expect.objectContaining({ score: 100, coverage: 1, notApplicable: 1 }));
        expect(calculateQualityScore(card, { ...base, _criterion_statuses: { greeting_quality: 'assessed' } })).toEqual(
            expect.objectContaining({ score: 100, coverage: 1, notApplicable: 1 })
        );
        expect(calculateQualityScore(card, { ...base, _criterion_statuses: { greeting_quality: 'assessed', stars: 'missing' } })).toEqual(
            expect.objectContaining({ score: null, candidateScore: 100, coverage: 0.5, status: 'needs_review' })
        );
        expect(
            calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 6 } })).criteria[1]
                .status
        ).toBe('invalid');
        expect(
            calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 0 } })).score
        ).toBe(50);
        expect(
            calculateQualityScore(card, {
                ...base,
                _criterion_statuses: { greeting_quality: 'insufficient_evidence', stars: 'not_applicable' },
            }).score
        ).toBeNull();
    });
    it('does not turn unusable recordings or an all-N/A form into a perfect score', () => {
        const card = createQualityScorecard(project({ 'custom:stars': { included: false } }), '99');
        expect(
            calculateQualityScore(card, {
                greeting_quality: null,
                _criterion_statuses: { greeting_quality: 'not_applicable' },
            }).status
        ).toBe('unscorable');
        expect(
            calculateQualityScore(card, { ...assessed({ greeting_quality: 100 }), _quality: { quality: 'low' } }).score
        ).toBeNull();
    });
    it('supports reversed numeric and categorical scoring without guessing units', () => {
        const card = createQualityScorecard(
            project({
                'custom:stars': { included: true, normalization: { kind: 'linear', min: 1, max: 5, inverted: true } },
            }),
            '99'
        );
        expect(
            calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 2 } })).score
        ).toBe(87.5);
        card.criteria[1].normalization = { kind: 'points', values: { good: 2, partial: 1, bad: 0 }, maxPoints: 2 };
        card.criteria[1].type = 'enum';
        expect(
            calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 'partial' } })).score
        ).toBe(75);
    });
    it('preserves the raw model answer under human corrections and respects boolean false', () => {
        const card = createQualityScorecard(
            {
                ...project(),
                customMetricsSchema: [{ id: 'check', type: 'boolean' }],
                qualityScoreConfig: { criteria: { 'custom:check': { included: true } } },
            },
            '99'
        );
        const input = assessed({
            greeting_quality: 100,
            custom_metrics: { check: true },
            _criterion_statuses: { greeting_quality: 'assessed', check: 'assessed' },
        });
        expect(
            calculateQualityScore(card, input, [{ metricId: 'check', origin: 'custom', boolValue: false }]).score
        ).toBe(50);
        expect(input.custom_metrics.check).toBe(true);
    });
    it('only applies a fatal zero if explicitly configured; missing critical evidence requires review', () => {
        const card = createQualityScorecard(project({ 'custom:stars': { included: true, critical: 'flag' } }), '99');
        expect(calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 0 } }))).toEqual(
            expect.objectContaining({ score: 50, criticalStatus: 'fail' })
        );
        card.criteria[1].critical = 'fail';
        expect(
            calculateQualityScore(card, assessed({ greeting_quality: 100, custom_metrics: { stars: 0 } })).score
        ).toBe(0);
        expect(
            calculateQualityScore(card, {
                greeting_quality: 100,
                _criterion_statuses: { greeting_quality: 'assessed' },
            }).score
        ).toBeNull();
    });
    it('freezes the actual scoring context, isolates tenant identity and ignores JSON key order', () => {
        const p = project();
        const card = createQualityScorecard(p, '99');
        const id = qualityHash(card);
        p.visibleDefaultMetrics.push('script_compliance');
        // Consumers serialize snapshots at capture time; no current config is needed to calculate a stored revision.
        expect(qualityHash(JSON.parse(JSON.stringify(card)))).toBe(id);
        expect(qualityHash({ a: 1, b: 2 })).toBe(qualityHash({ b: 2, a: 1 }));
        expect(qualityHash(createQualityScorecard(project(), '1'))).not.toBe(id);
    });
    it('includes scaled custom criteria in new scorecards and labels reconstructed history', () => {
        expect(createQualityScorecard(project(), '99').criteria[1].included).toBe(true);
        const m = {
            greeting_quality: 100,
            custom_metrics: { stars: 4 },
            _custom_meta: { stars: { type: 'number', min: 0, max: 5 } },
        };
        const card = createQualityScorecard({ id: 5 }, '99', { legacy: true, metrics: m });
        expect(calculateQualityScore(card, m)).toEqual(expect.objectContaining({ score: 90, contextIncomplete: true }));
    });
    it('uses mean of persisted call scores and no rounding or low-quality fallback', () => {
        expect(
            averagePublishedQuality([
                { analytics: { qualityScore: 100, qualityStatus: 'scored' } },
                { analytics: { qualityScore: 0, qualityStatus: 'scored' } },
                { analytics: { qualityScore: null, qualityStatus: 'unscorable' } },
            ])
        ).toBe(50);
        expect(averagePublishedQuality([])).toBeNull();
    });
    it('rejects unknown root fields and never admits a rule without an explicit scale', () => {
        expect(() => validateQualityConfig({ ignored: true } as any)).toThrow('Unknown quality setting');
        expect(() =>
            createQualityScorecard(
                {
                    ...project(),
                    customMetricsSchema: [{ id: 'money', type: 'number', name: 'Money' }],
                    qualityScoreConfig: { criteria: { 'custom:money': { included: true } } },
                },
                '99'
            )
        ).toThrow('requires a score mapping');
    });
    it.each([
        { criteria: { a: { weight: 0 } } },
        { minimumCoverage: 2 },
        { criteria: { a: { normalization: { kind: 'linear', min: 5, max: 5 } } } },
        { criteria: { a: { normalization: { kind: 'points', maxPoints: 1, values: { a: 2 } } } } },
    ])('rejects invalid rules: %j', (config) => {
        expect(() => validateQualityConfig(config as any)).toThrow();
    });
});
