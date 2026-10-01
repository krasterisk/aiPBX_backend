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
    unsuccessfulCount?: number;
    failureReasons?: FailureReasonFact[];
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
    customMetrics: Array<{ name: string; type: string; summary: string }>;
    dataQuality: { excludedLowQualityCount: number };
    focusMetrics: string[];
    sampleSize: number;
    lowConfidence: boolean;
    unsuccessful: {
        count: number;
        reasons: FailureReasonFact[];
    };
    comparison: PeriodComparison;
}

export interface FailureReasonFact {
    reason: string;
    count: number;
    shareOfUnsuccessful: number;
    channelIds: string[];
}

export interface PeriodMetricSnapshot {
    label: string;
    calls: number;
    successRate: number;
    avgScore: number;
    unsuccessfulCount: number;
    worstMetric?: { metric: string; value: number };
}

export interface PeriodComparison {
    empty: boolean;
    current: PeriodMetricSnapshot;
    previous?: PeriodMetricSnapshot;
    deltas?: {
        calls: number;
        successRatePp: number;
        avgScore: number;
        unsuccessfulCount: number;
    };
}

export interface FailureReasonSource {
    channelId?: string | number;
    analytics?: { metrics?: Record<string, unknown> };
}

const FAILURE_REASON_MAX = 240;
const FAILURE_REASON_TOP = 8;
const FAILURE_REASON_UNIQUE_CAP = 20;
const FAILURE_CHANNEL_IDS = 3;

const DEFAULT_METRIC_NAMES: Record<string, string> = {
    greeting_quality: 'Качество приветствия',
    script_compliance: 'Следование скрипту',
    politeness_empathy: 'Вежливость и эмпатия',
    active_listening: 'Активное слушание',
    objection_handling: 'Работа с возражениями',
    product_knowledge: 'Знание продукта',
    problem_resolution: 'Решение проблемы',
    speech_clarity_pace: 'Темп речи',
    closing_quality: 'Качество завершения',
    avgScore: 'Средний балл',
    successRate: 'Доля успешных обращений',
    csat: 'Удовлетворённость клиента (CSAT)',
    customer_sentiment: 'Эмоциональный настрой клиента',
    sentiment: 'Эмоциональный настрой клиента',
    success: 'Итог обращения',
};

function metricDisplayName(id: string, project?: OperatorProject | null): string {
    const custom = project?.customMetricsSchema?.find(metric => metric.id === id)?.name?.trim();
    if (custom) return custom;
    return DEFAULT_METRIC_NAMES[id] || id;
}

function rankMetrics(
    aggregatedMetrics: Record<string, number>,
    focusMetrics: string[],
    nameOf: (id: string) => string,
): InsightsFacts['metricRanking'] {
    const entries = Object.entries(aggregatedMetrics)
        .filter(([metric]) => !focusMetrics.length || focusMetrics.includes(metric))
        .map(([metric, value]) => ({ metric: nameOf(metric), value }))
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
    customMetricsAggregated: DashboardSnapshot['customMetricsAggregated'],
    nameOf: (id: string) => string,
): InsightsFacts['customMetrics'] {
    if (!customMetricsAggregated) return [];

    return Object.entries(customMetricsAggregated).map(([id, agg]) => {
        const name = nameOf(id);
        if (agg.type === 'boolean' && agg.distribution) {
            const trueCount = agg.distribution.true ?? agg.distribution['true'] ?? 0;
            const falseCount = agg.distribution.false ?? agg.distribution['false'] ?? 0;
            const total = trueCount + falseCount;
            const pct = total > 0 ? Math.round((trueCount / total) * 100) : 0;
            return { name, type: agg.type, summary: `${name} true=${pct}%` };
        }
        if (typeof agg.value === 'number') {
            return { name, type: agg.type, summary: `${name} avg=${agg.value}` };
        }
        return { name, type: agg.type, summary: `${name} aggregated` };
    });
}

export function resolveInsightsMinCalls(): number {
    const raw = process.env.OPERATOR_INSIGHTS_MIN_CALLS;
    const parsed = raw ? Number(raw) : DEFAULT_INSIGHTS_MIN_CALLS;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSIGHTS_MIN_CALLS;
}

function parseUtcDay(iso: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatUtcDay(date: Date): string {
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}-${day}`;
}

function addUtcDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function inclusiveUtcDays(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function lastUtcDayOfMonth(year: number, monthIndex: number): number {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function isFullCalendarMonth(start: Date, end: Date): boolean {
    return start.getUTCFullYear() === end.getUTCFullYear()
        && start.getUTCMonth() === end.getUTCMonth()
        && start.getUTCDate() === 1
        && end.getUTCDate() === lastUtcDayOfMonth(end.getUTCFullYear(), end.getUTCMonth());
}

function isFullCalendarYear(start: Date, end: Date): boolean {
    return start.getUTCFullYear() === end.getUTCFullYear()
        && start.getUTCMonth() === 0
        && start.getUTCDate() === 1
        && end.getUTCMonth() === 11
        && end.getUTCDate() === 31;
}

/**
 * Previous window for insight comparison.
 * A full calendar month or year maps to the previous calendar month or year.
 * Any other range, including one day and seven days, maps to the equal-length
 * window that ends the day before the selected start.
 */
export function resolveComparisonPeriod(
    startDate?: string,
    endDate?: string,
): { startDate: string; endDate: string } | null {
    if (!startDate || !endDate) return null;
    const start = parseUtcDay(startDate);
    const end = parseUtcDay(endDate);
    if (!start || !end || end.getTime() < start.getTime()) return null;

    if (isFullCalendarMonth(start, end)) {
        const previousStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
        const previousEnd = new Date(Date.UTC(
            previousStart.getUTCFullYear(),
            previousStart.getUTCMonth(),
            lastUtcDayOfMonth(previousStart.getUTCFullYear(), previousStart.getUTCMonth()),
        ));
        return { startDate: formatUtcDay(previousStart), endDate: formatUtcDay(previousEnd) };
    }

    if (isFullCalendarYear(start, end)) {
        const year = start.getUTCFullYear() - 1;
        return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    }

    const length = inclusiveUtcDays(start, end);
    const previousEnd = addUtcDays(start, -1);
    const previousStart = addUtcDays(previousEnd, -(length - 1));
    return { startDate: formatUtcDay(previousStart), endDate: formatUtcDay(previousEnd) };
}

function normalizeFailureReason(text: string): string {
    return text.replace(/[«»"'`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function displayFailureReason(text: string): string {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= FAILURE_REASON_MAX) return trimmed;
    return `${trimmed.slice(0, FAILURE_REASON_MAX - 1)}…`;
}

export function collectFailureReasons(records: FailureReasonSource[]): {
    unsuccessfulCount: number;
    reasons: FailureReasonFact[];
} {
    const groups = new Map<string, { reason: string; count: number; channelIds: string[] }>();
    let unsuccessfulCount = 0;

    for (const record of records) {
        const metrics = record.analytics?.metrics;
        if (!metrics || metrics.success !== false) continue;
        unsuccessfulCount += 1;

        const assessment = (metrics._assessments as Record<string, { rationale?: string }> | undefined)?.success;
        const rationale = typeof assessment?.rationale === 'string' ? assessment.rationale.trim() : '';
        if (!rationale) continue;

        const key = normalizeFailureReason(rationale);
        if (!key) continue;
        const channelId = record.channelId != null ? String(record.channelId) : '';
        const existing = groups.get(key);
        if (!existing) {
            groups.set(key, {
                reason: displayFailureReason(rationale),
                count: 1,
                channelIds: channelId ? [channelId] : [],
            });
            continue;
        }
        existing.count += 1;
        if (channelId && existing.channelIds.length < FAILURE_CHANNEL_IDS && !existing.channelIds.includes(channelId)) {
            existing.channelIds.push(channelId);
        }
    }

    const ranked = [...groups.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    const allUnique = ranked.length > 0 && ranked.every(item => item.count === 1);
    const limited = ranked.slice(0, allUnique ? FAILURE_REASON_UNIQUE_CAP : FAILURE_REASON_TOP);
    const denom = unsuccessfulCount || 1;

    return {
        unsuccessfulCount,
        reasons: limited.map(item => ({
            reason: item.reason,
            count: item.count,
            shareOfUnsuccessful: parseFloat(((item.count / denom) * 100).toFixed(1)),
            channelIds: item.channelIds,
        })),
    };
}

function worstMetricOf(
    aggregatedMetrics: Record<string, number> | undefined,
    nameOf: (id: string) => string = id => id,
): { metric: string; value: number } | undefined {
    const entries = Object.entries(aggregatedMetrics || [])
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
    if (!entries.length) return undefined;
    entries.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    return { metric: nameOf(entries[0][0]), value: entries[0][1] };
}

function periodSnapshot(
    dashboard: DashboardSnapshot,
    label: string,
    unsuccessfulCount: number,
): PeriodMetricSnapshot {
    return {
        label,
        calls: dashboard.totalAnalyzed,
        successRate: dashboard.successRate,
        avgScore: dashboard.averageScore,
        unsuccessfulCount,
        worstMetric: worstMetricOf(dashboard.aggregatedMetrics),
    };
}

export function buildPeriodComparison(
    current: DashboardSnapshot,
    previous: DashboardSnapshot | null,
    currentLabel: string,
    previousLabel: string | null,
): PeriodComparison {
    const currentSnapshot = periodSnapshot(current, currentLabel, current.unsuccessfulCount ?? 0);
    if (!previous || previous.totalAnalyzed <= 0 || !previousLabel) {
        return { empty: true, current: currentSnapshot };
    }
    const previousSnapshot = periodSnapshot(previous, previousLabel, previous.unsuccessfulCount ?? 0);
    return {
        empty: false,
        current: currentSnapshot,
        previous: previousSnapshot,
        deltas: {
            calls: current.totalAnalyzed - previous.totalAnalyzed,
            successRatePp: parseFloat((current.successRate - previous.successRate).toFixed(2)),
            avgScore: parseFloat((current.averageScore - previous.averageScore).toFixed(2)),
            unsuccessfulCount: (current.unsuccessfulCount ?? 0) - (previous.unsuccessfulCount ?? 0),
        },
    };
}

export function buildInsightsFacts(
    dashboard: DashboardSnapshot,
    project?: OperatorProject | null,
    query?: InsightsFactsQuery,
    minCalls = resolveInsightsMinCalls(),
    comparison?: PeriodComparison | null,
): InsightsFacts {
    const focusMetrics = (project?.visibleDefaultMetrics || []) as DefaultMetricKey[];
    const nameOf = (id: string) => metricDisplayName(id, project);
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
        metricRanking: rankMetrics(dashboard.aggregatedMetrics, focusMetrics, nameOf),
        operatorOutliers: filteredOutliers,
        trends: buildTrends(dashboard.timeSeries),
        customMetrics: summarizeCustomMetrics(dashboard.customMetricsAggregated, nameOf),
        dataQuality: { excludedLowQualityCount: dashboard.excludedLowQualityCount ?? 0 },
        focusMetrics: focusMetrics.map(nameOf),
        sampleSize,
        lowConfidence: sampleSize < minCalls,
        unsuccessful: {
            count: dashboard.unsuccessfulCount ?? 0,
            reasons: dashboard.failureReasons ?? [],
        },
        comparison: comparison
            ? {
                ...comparison,
                current: {
                    ...comparison.current,
                    worstMetric: comparison.current.worstMetric
                        ? { metric: nameOf(comparison.current.worstMetric.metric), value: comparison.current.worstMetric.value }
                        : undefined,
                },
                previous: comparison.previous
                    ? {
                        ...comparison.previous,
                        worstMetric: comparison.previous.worstMetric
                            ? { metric: nameOf(comparison.previous.worstMetric.metric), value: comparison.previous.worstMetric.value }
                            : undefined,
                    }
                    : undefined,
            }
            : {
            empty: true,
            current: {
                label: '',
                calls: dashboard.totalAnalyzed,
                successRate: dashboard.successRate,
                avgScore: dashboard.averageScore,
                unsuccessfulCount: dashboard.unsuccessfulCount ?? 0,
                worstMetric: worstMetricOf(dashboard.aggregatedMetrics, nameOf),
            },
        },
    };
}
