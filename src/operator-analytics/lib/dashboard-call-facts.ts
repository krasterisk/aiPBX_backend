import { postgresJsonbCast } from './dashboard-aggregation';

interface CallObservation {
    analytics?: { metrics?: any; sentiment?: string | null } | null;
}
export function callOutcome(record: CallObservation): boolean | null {
    const metrics = record.analytics?.metrics;
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
    if (typeof metrics.success === 'boolean') return metrics.success;
    return typeof metrics.scenario_analysis?.success === 'boolean' ? metrics.scenario_analysis.success : null;
}
export function dashboardCallFacts(records: CallObservation[]) {
    let successfulCount = 0, unsuccessfulCount = 0;
    const moods = { positive: 0, neutral: 0, negative: 0 };
    for (const record of records) {
        const outcome = callOutcome(record);
        if (outcome === true) successfulCount++;
        else if (outcome === false) unsuccessfulCount++;
        const metrics = record.analytics?.metrics;
        const mood = String(record.analytics?.sentiment || metrics?.customer_sentiment || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(moods, mood)) moods[mood]++;
    }
    const known = successfulCount + unsuccessfulCount;
    const moodTotal = moods.positive + moods.neutral + moods.negative;
    return {
        successfulCount, unsuccessfulCount,
        unknownOutcomeCount: records.length - known,
        successRate: known ? Number((successfulCount * 100 / known).toFixed(2)) : 0,
        sentimentDistribution: Object.fromEntries(Object.entries(moods).map(([key, count]) =>
            [key, moodTotal ? Number((count * 100 / moodTotal).toFixed(2)) : 0])) as typeof moods,
    };
}

/** Same saved-answer semantics as dashboardCallFacts, without capped IDs or a partial projection. */
export function callDistributionCondition(
    dialect: string,
    filter: { success?: boolean | null; sentiment?: string | null; withoutOutcome?: boolean },
    outerAlias = 'AiCdr',
): string {
    if (filter.withoutOutcome && typeof filter.success === 'boolean') throw new Error('Conflicting outcome filters');
    if (filter.withoutOutcome && filter.sentiment) return `(${callDistributionCondition(dialect, { withoutOutcome: true }, outerAlias)} AND ${callDistributionCondition(dialect, { sentiment: filter.sentiment }, outerAlias)})`;
    if (!['postgres', 'mysql'].includes(dialect) || !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(outerAlias))
        throw new Error('Unsupported distribution query');
    const q = (key: string) => dialect === 'postgres' ? `"${key}"` : `\`${key}\``;
    const json = dialect === 'postgres' ? postgresJsonbCast('d.metrics') : 'd.metrics';
    const text = (path: string[]) => dialect === 'postgres'
        ? `(${json}#>>'{${path.join(',')}}')`
        : `JSON_UNQUOTE(JSON_EXTRACT(${json}, '$.${path.join('.')}'))`;
    const type = (path: string[]) => dialect === 'postgres'
        ? `jsonb_typeof(${json}#>'{${path.join(',')}}')`
        : `JSON_TYPE(JSON_EXTRACT(${json}, '$.${path.join('.')}'))`;
    const booleanType = dialect === 'postgres' ? 'boolean' : 'BOOLEAN';
    const outcome = `(CASE WHEN ${type(['success'])}='${booleanType}' THEN ${text(['success'])}
        WHEN ${type(['scenario_analysis', 'success'])}='${booleanType}' THEN ${text(['scenario_analysis', 'success'])} END)`;
    const parts = [`d.${q('channelId')}=${q(outerAlias)}.${q('channelId')}`];
    if (filter.withoutOutcome) parts.push(`${outcome} IN ('true','false')`);
    else if (typeof filter.success === 'boolean') parts.push(`${outcome}='${filter.success ? 'true' : 'false'}'`);
    if (filter.sentiment) {
        if (!['positive', 'neutral', 'negative'].includes(filter.sentiment)) throw new Error('Invalid sentiment');
        parts.push(`LOWER(COALESCE(NULLIF(d.${q('sentiment')},''),${text(['customer_sentiment'])}))='${filter.sentiment}'`);
    }
    return `${filter.withoutOutcome ? 'NOT ' : ''}EXISTS (SELECT 1 FROM ${q('aiAnalytics')} d WHERE ${parts.join(' AND ')})`;
}

/** Volume counts include all filtered calls; scoring averages retain their scoring population. */
export function withScoringAverages<T extends { label: string; avgScore: number; avgDuration: number }>(all: T[], scored: T[]): T[] {
    const byLabel = new Map(scored.map(point => [point.label, point]));
    return all.map(point => ({ ...point, avgScore: byLabel.get(point.label)?.avgScore ?? 0,
        avgDuration: byLabel.get(point.label)?.avgDuration ?? 0 }));
}
