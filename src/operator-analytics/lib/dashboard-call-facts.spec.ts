import { callOutcome, dashboardCallFacts, callDistributionCondition, withScoringAverages } from './dashboard-call-facts';

it('counts exact outcomes, keeps unknowns separate and rejects truthy strings and low ASR', () => {
    const records = [
        { analytics: { metrics: { success: true } } },
        { analytics: { metrics: { scenario_analysis: { success: false } } } },
        { analytics: { metrics: { success: false, scenario_analysis: { success: true } } } },
        { analytics: { metrics: { success: true, _quality: { quality: 'low' } } } },
        { analytics: { metrics: { success: 'false' } } }, {},
    ];
    expect(records.map(callOutcome)).toEqual([true, false, false, null, null, null]);
    expect(dashboardCallFacts(records)).toMatchObject({ successfulCount: 1, unsuccessfulCount: 2, unknownOutcomeCount: 3, successRate: 33.33 });
    expect(dashboardCallFacts([{ analytics: { metrics: { success: true, _quality: { quality: 'unusable' } } } }])).toMatchObject({ successfulCount: 0, unknownOutcomeCount: 1 });
});
it('uses a correlated saved-answer predicate for both dialects, without an ID cap or projection fallback', () => {
    for (const dialect of ['postgres', 'mysql']) {
        const sql = callDistributionCondition(dialect, { success: false });
        expect(sql).toContain('EXISTS');
        expect(sql).toContain('scenario_analysis');
        expect(sql).toContain('unusable');
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
