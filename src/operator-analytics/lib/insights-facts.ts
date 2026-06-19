import type { DefaultMetricKey } from '../interfaces/operator-metrics.interface';
import type { OperatorProject } from '../operator-project.model';

export const DEFAULT_INSIGHTS_MIN_CALLS = 10;

export interface DashboardSnapshot {
    totalAnalyzed: number;
    averageScore: number;
    successRate: number;
    averageDuration?: number;
    aggregatedMetrics: Record<string, number>;
    customMetricsAggregated?: Record<string, { type: string; value?: number; distribution?: Record<string, number> }>;
    sentimentDistribution?: { positive: number; neutral: number; negative: number };
    timeSeries?: {
        daily: Array<{ label: string; callsCount: number; avgScore: number }>;
        monthly: Array<{ label: string; callsCount: number; avgScore: number }>;
    };
    excludedLowQualityCount?: number;
    agentScorecards?: Array<{
        operatorName: string;
        callsCount: number;
        averageScore: number;
        successRate: number;
    }>;
}

export interface InsightsFactsQuery {
    operatorName?: string;
    startDate?: string;
    endDate?: string;
}

export interface InsightsFacts {
    summary: {
        avgScore: number;
        successRate: number;
        sampleSize: number;
        avgDuration?: number;
        sentiment?: { positive: number; neutral: number; negative: number };
    };
    metricRanking: {
        worst?: { metric: string; value: number };
        best?: { metric: string; value: number };
        all: Array<{ metric: string; value: number }>;
    };
    operatorOutliers: {
        bottom: Array<{ operatorName: string; averageScore: number; callsCount: number }>;
        top: Array<{ operatorName: string; averageScore: number; callsCount: number }>;
    };
    trends: Array<{ metric: string; from: number; to: number; delta: number; periodLabel: string }>;
    customMetrics: Array<{ id: string; type: string; summary: string }>;
    dataQuality: { excludedLowQualityCount: number };
    focusMetrics: string[];
    sampleSize: number;
    lowConfidence: boolean;
}

function rankMetrics(
    aggregatedMetrics: Record<string, number>,
    focusMetrics: string[],
): InsightsFacts['metricRanking'] {
    const entries = Object.entries(aggregatedMetrics)
        .filter(([metric]) => !focusMetrics.length || focusMetrics.includes(metric))
        .map(([metric, value]) => ({ metric, value }))
        .sort((a, b) => a.value - b.value);

    return {
        worst: entries[0],
        best: entries[entries.length - 1],
        all: entries,
    };
}

function buildOperatorOutliers(
    scorecards: DashboardSnapshot['agentScorecards'],
    minCalls = 3,
) {
    const eligible = (scorecards || [])
        .filter(s => s.callsCount >= minCalls)
        .sort((a, b) => a.averageScore - b.averageScore);

    return {
        bottom: eligible.slice(0, 3).map(s => ({
            operatorName: s.operatorName,
            averageScore: s.averageScore,
            callsCount: s.callsCount,
        })),
        top: eligible.slice(-3).reverse().map(s => ({
            operatorName: s.operatorName,
            averageScore: s.averageScore,
            callsCount: s.callsCount,
        })),
    };
}

function buildTrends(timeSeries?: DashboardSnapshot['timeSeries']): InsightsFacts['trends'] {
    const series = timeSeries?.daily?.length
        ? timeSeries.daily
        : timeSeries?.monthly || [];

    if (series.length < 2) return [];

    const first = series[0];
    const last = series[series.length - 1];
    const delta = parseFloat((last.avgScore - first.avgScore).toFixed(2));

    return [{
        metric: 'avgScore',
        from: first.avgScore,
        to: last.avgScore,
        delta,
        periodLabel: `${first.label} → ${last.label}`,
    }];
}

function summarizeCustomMetrics(
    customMetricsAggregated?: DashboardSnapshot['customMetricsAggregated'],
): InsightsFacts['customMetrics'] {
    if (!customMetricsAggregated) return [];

    return Object.entries(customMetricsAggregated).map(([id, agg]) => {
        if (agg.type === 'boolean' && agg.distribution) {
            const trueCount = agg.distribution.true ?? agg.distribution['true'] ?? 0;
            const falseCount = agg.distribution.false ?? agg.distribution['false'] ?? 0;
            const total = trueCount + falseCount;
            const pct = total > 0 ? Math.round((trueCount / total) * 100) : 0;
            return { id, type: agg.type, summary: `${id} true=${pct}%` };
        }
        if (typeof agg.value === 'number') {
            return { id, type: agg.type, summary: `${id} avg=${agg.value}` };
        }
        return { id, type: agg.type, summary: `${id} aggregated` };
    });
}

export function resolveInsightsMinCalls(): number {
    const raw = process.env.OPERATOR_INSIGHTS_MIN_CALLS;
    const parsed = raw ? Number(raw) : DEFAULT_INSIGHTS_MIN_CALLS;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSIGHTS_MIN_CALLS;
}

export function buildInsightsFacts(
    dashboard: DashboardSnapshot,
    project?: OperatorProject | null,
    query?: InsightsFactsQuery,
    minCalls = resolveInsightsMinCalls(),
): InsightsFacts {
    const focusMetrics = (project?.visibleDefaultMetrics || []) as DefaultMetricKey[];
    const sampleSize = dashboard.totalAnalyzed;
    const operatorOutliers = buildOperatorOutliers(dashboard.agentScorecards);

    let filteredOutliers = operatorOutliers;
    if (query?.operatorName) {
        const name = query.operatorName.trim().toLowerCase();
        const match = (dashboard.agentScorecards || []).find(
            s => s.operatorName.toLowerCase() === name,
        );
        filteredOutliers = {
            bottom: match ? [{ operatorName: match.operatorName, averageScore: match.averageScore, callsCount: match.callsCount }] : [],
            top: match ? [{ operatorName: match.operatorName, averageScore: match.averageScore, callsCount: match.callsCount }] : [],
        };
    }

    return {
        summary: {
            avgScore: dashboard.averageScore,
            successRate: dashboard.successRate,
            sampleSize,
            avgDuration: dashboard.averageDuration,
            sentiment: dashboard.sentimentDistribution,
        },
        metricRanking: rankMetrics(dashboard.aggregatedMetrics, focusMetrics),
        operatorOutliers: filteredOutliers,
        trends: buildTrends(dashboard.timeSeries),
        customMetrics: summarizeCustomMetrics(dashboard.customMetricsAggregated),
        dataQuality: { excludedLowQualityCount: dashboard.excludedLowQualityCount ?? 0 },
        focusMetrics: [...focusMetrics],
        sampleSize,
        lowConfidence: sampleSize < minCalls,
    };
}
