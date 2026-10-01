import {
    buildInsightsFacts,
    buildPeriodComparison,
    collectFailureReasons,
    resolveComparisonPeriod,
    resolveInsightsMinCalls,
} from './insights-facts';
import { buildInsightsPrompt } from './insights-prompt';

function reasonCall(channelId: string, rationale: string, success = false) {
    return {
        channelId,
        analytics: { metrics: { success, _assessments: { success: { rationale } } } },
    };
}

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
        expect(facts.metricRanking.worst?.metric).toBe('Качество приветствия');
        expect(facts.metricRanking.worst?.value).toBe(58);
        expect(facts.metricRanking.best?.metric).toBe('Вежливость и эмпатия');
    });

    it('uses the project metric name instead of the raw id', () => {
        const facts = buildInsightsFacts(
            {
                ...dashboardFixture,
                customMetricsAggregated: {
                    patient_address_form: { type: 'boolean', value: 68.67 },
                },
            },
            { customMetricsSchema: [{ id: 'patient_address_form', name: 'Обращение к пациенту', type: 'boolean', description: '' }] } as any,
        );
        expect(facts.customMetrics[0].name).toBe('Обращение к пациенту');
        expect(facts.customMetrics[0].summary).toContain('Обращение к пациенту');
        expect(facts.customMetrics[0].summary).not.toContain('patient_address_form');
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
        expect(combined).toContain('priority means importance');
        expect(combined).toContain('Use type for polarity');
    });

    it('groups unsuccessful rationales and keeps three example calls', () => {
        const records = [
            reasonCall('a', 'Пациент не записался'),
            reasonCall('b', 'пациент не записался'),
            reasonCall('c', 'Пациент не записался'),
            reasonCall('d', 'Пациент не записался'),
            reasonCall('e', 'Нет врача в расписании'),
            reasonCall('ok', 'Успех', true),
            { channelId: 'bare', analytics: { metrics: { success: false } } },
        ];
        const facts = collectFailureReasons(records);
        expect(facts.unsuccessfulCount).toBe(6);
        expect(facts.reasons[0]).toMatchObject({
            count: 4,
            shareOfUnsuccessful: 66.7,
            channelIds: ['a', 'b', 'c'],
        });
        expect(facts.reasons[0].reason).toBe('Пациент не записался');
        expect(facts.reasons[1].count).toBe(1);
    });

    it('keeps up to 20 reasons when every unsuccessful call has a distinct explanation', () => {
        const records = Array.from({ length: 9 }, (_, i) => reasonCall(String(i), `Причина ${i}`));
        expect(collectFailureReasons(records).reasons).toHaveLength(9);
    });

    it('resolves the previous day, week, calendar month, and calendar year', () => {
        expect(resolveComparisonPeriod('2026-09-15', '2026-09-15')).toEqual({
            startDate: '2026-09-14',
            endDate: '2026-09-14',
        });
        expect(resolveComparisonPeriod('2026-09-08', '2026-09-14')).toEqual({
            startDate: '2026-09-01',
            endDate: '2026-09-07',
        });
        expect(resolveComparisonPeriod('2026-03-01', '2026-03-31')).toEqual({
            startDate: '2026-02-01',
            endDate: '2026-02-28',
        });
        expect(resolveComparisonPeriod('2026-01-01', '2026-12-31')).toEqual({
            startDate: '2025-01-01',
            endDate: '2025-12-31',
        });
        expect(resolveComparisonPeriod('2026-09-10', '2026-09-12')).toEqual({
            startDate: '2026-09-07',
            endDate: '2026-09-09',
        });
        expect(resolveComparisonPeriod(undefined, '2026-09-12')).toBeNull();
    });

    it('marks comparison empty when the previous window has no calls', () => {
        const comparison = buildPeriodComparison(
            { ...dashboardFixture, unsuccessfulCount: 2 },
            { ...dashboardFixture, totalAnalyzed: 0, unsuccessfulCount: 0 },
            '2026-09-01 — 2026-09-30',
            '2026-08-01 — 2026-08-31',
        );
        expect(comparison.empty).toBe(true);
        expect(comparison.deltas).toBeUndefined();
    });

    it('reports deltas against the previous period', () => {
        const comparison = buildPeriodComparison(
            { ...dashboardFixture, totalAnalyzed: 10, successRate: 70, averageScore: 60, unsuccessfulCount: 3 },
            { ...dashboardFixture, totalAnalyzed: 8, successRate: 80, averageScore: 75, unsuccessfulCount: 1 },
            '2026-09-01 — 2026-09-30',
            '2026-08-01 — 2026-08-31',
        );
        expect(comparison.empty).toBe(false);
        expect(comparison.deltas).toEqual({
            calls: 2,
            successRatePp: -10,
            avgScore: -15,
            unsuccessfulCount: 2,
        });
        expect(comparison.current.worstMetric?.metric).toBe('greeting_quality');
    });

    it('asks for a failure gap and a period trend when those facts exist', () => {
        const facts = buildInsightsFacts(
            {
                ...dashboardFixture,
                unsuccessfulCount: 4,
                failureReasons: [{
                    reason: 'Пациент не записался',
                    count: 3,
                    shareOfUnsuccessful: 75,
                    channelIds: ['a'],
                }],
            },
            null,
            { startDate: '2026-09-01', endDate: '2026-09-30' },
            10,
            buildPeriodComparison(
                { ...dashboardFixture, unsuccessfulCount: 4 },
                { ...dashboardFixture, totalAnalyzed: 6, unsuccessfulCount: 1 },
                '2026-09-01 — 2026-09-30',
                '2026-08-01 — 2026-08-31',
            ),
        );
        const { user } = buildInsightsPrompt(facts);
        expect(user).toContain('type "gap"');
        expect(user).toContain('shareOfUnsuccessful');
        expect(user).toContain('type "trend"');
        expect(user).toContain('facts.comparison.deltas');
        expect(user).not.toContain('facts.comparison.empty is true');
    });

    it('resolveInsightsMinCalls defaults to 10', () => {
        const prev = process.env.OPERATOR_INSIGHTS_MIN_CALLS;
        delete process.env.OPERATOR_INSIGHTS_MIN_CALLS;
        expect(resolveInsightsMinCalls()).toBe(10);
        if (prev !== undefined) process.env.OPERATOR_INSIGHTS_MIN_CALLS = prev;
    });
});
