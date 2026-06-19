import { buildInsightsFacts, resolveInsightsMinCalls } from './insights-facts';
import { buildInsightsPrompt } from './insights-prompt';

describe('insights-facts', () => {
    const dashboardFixture = {
        totalAnalyzed: 4,
        averageScore: 72.4,
        successRate: 81,
        averageDuration: 120,
        aggregatedMetrics: {
            greeting_quality: 58,
            politeness_empathy: 91,
            script_compliance: 70,
        },
        customMetricsAggregated: {
            upsell_attempt: { type: 'boolean', distribution: { true: 34, false: 66 } },
        },
        sentimentDistribution: { positive: 10, neutral: 5, negative: 2 },
        timeSeries: {
            daily: [
                { label: '2026-06-01', callsCount: 2, avgScore: 68 },
                { label: '2026-06-07', callsCount: 2, avgScore: 74 },
            ],
            monthly: [],
        },
        excludedLowQualityCount: 3,
        agentScorecards: [
            { operatorName: 'Иванов', callsCount: 8, averageScore: 54, successRate: 60 },
            { operatorName: 'Петров', callsCount: 10, averageScore: 88, successRate: 90 },
            { operatorName: 'Сидоров', callsCount: 2, averageScore: 40, successRate: 50 },
        ],
    };

    it('buildInsightsFacts produces metric ranking worst/best', () => {
        const facts = buildInsightsFacts(dashboardFixture, { visibleDefaultMetrics: ['greeting_quality', 'politeness_empathy'] } as any);
        expect(facts.metricRanking.worst?.metric).toBe('greeting_quality');
        expect(facts.metricRanking.worst?.value).toBe(58);
        expect(facts.metricRanking.best?.metric).toBe('politeness_empathy');
    });

    it('buildInsightsFacts produces operator outliers (min 3 calls)', () => {
        const facts = buildInsightsFacts(dashboardFixture);
        expect(facts.operatorOutliers.bottom[0]?.operatorName).toBe('Иванов');
        expect(facts.operatorOutliers.top[0]?.operatorName).toBe('Петров');
        expect(facts.operatorOutliers.bottom.some(o => o.operatorName === 'Сидоров')).toBe(false);
    });

    it('sets lowConfidence when sample below min calls', () => {
        const facts = buildInsightsFacts(dashboardFixture, null, undefined, 10);
        expect(facts.lowConfidence).toBe(true);
        expect(facts.sampleSize).toBe(4);
    });

    it('buildInsightsPrompt contains grounded-only and Russian guardrails', () => {
        const facts = buildInsightsFacts(dashboardFixture);
        const { system, user } = buildInsightsPrompt(facts, { name: 'Test Project' });
        const combined = `${system}\n${user}`;
        expect(combined).toContain('ONLY provided facts');
        expect(combined).toContain('Russian');
    });

    it('resolveInsightsMinCalls defaults to 10', () => {
        const prev = process.env.OPERATOR_INSIGHTS_MIN_CALLS;
        delete process.env.OPERATOR_INSIGHTS_MIN_CALLS;
        expect(resolveInsightsMinCalls()).toBe(10);
        if (prev !== undefined) process.env.OPERATOR_INSIGHTS_MIN_CALLS = prev;
    });
});
