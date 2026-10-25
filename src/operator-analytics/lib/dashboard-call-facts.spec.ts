import { callOutcome, dashboardCallFacts, callDistributionCondition, withScoringAverages } from './dashboard-call-facts';

it('counts exact outcomes, keeps unknowns separate and rejects truthy strings but includes every ASR quality', () => {
    const records = [
        { analytics: { metrics: { success: true } } },
        { analytics: { metrics: { scenario_analysis: { success: false } } } },
        { analytics: { metrics: { success: false, scenario_analysis: { success: true } } } },
        { analytics: { metrics: { success: true, _quality: { quality: 'low' } } } },
        { analytics: { metrics: { success: 'false' } } }, {},
    ];
    expect(records.map(callOutcome)).toEqual([true, false, false, true, null, null]);
    expect(dashboardCallFacts(records)).toMatchObject({ successfulCount: 2, unsuccessfulCount: 2, unknownOutcomeCount: 2, successRate: 50 });
    expect(dashboardCallFacts([{ analytics: { metrics: { success: true, _quality: { quality: 'unusable' } } } }])).toMatchObject({ successfulCount: 1, unknownOutcomeCount: 0 });
});
it('uses a correlated saved-answer predicate for both dialects, without an ID cap or projection fallback', () => {
    for (const dialect of ['postgres', 'mysql']) {
        const sql = callDistributionCondition(dialect, { success: false });
        expect(sql).toContain('EXISTS');
        expect(sql).toContain('scenario_analysis');
        expect(sql).not.toContain('_quality');
        expect(sql).not.toMatch(/LIMIT|operator_metric_values/);
        expect(callDistributionCondition(dialect, { withoutOutcome: true })).toMatch(/^NOT EXISTS/);
    }
});
it('retains all-call volume while preserving scoring-population averages', () => {
    expect(withScoringAverages([{ label: 'a', callsCount: 4, avgScore: 20, avgDuration: 30 }, { label: 'b', callsCount: 1, avgScore: 0, avgDuration: 10 }],
        [{ label: 'a', callsCount: 2, avgScore: 90, avgDuration: 50 }])).toEqual([
        { label: 'a', callsCount: 4, avgScore: 90, avgDuration: 50 }, { label: 'b', callsCount: 1, avgScore: 0, avgDuration: 0 },
    ]);
});
