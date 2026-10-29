import { QueryTypes, Sequelize } from 'sequelize';
import { DashboardCdrFilters, postgresJsonbCast } from '../lib/dashboard-aggregation';
import { appendAnalyticsSelectionSql } from '../lib/analytics-selection';
import { analyticsDate } from '../lib/analytics-date';
import { QUALITY_FORMULA_VERSION } from './quality-score';
import { journalValues, journalPeople, journalTags } from '../../ai-cdr/journal-selection';
import { parseCsatFilter } from '../../ai-cdr/parse-csat-filter';
import { loadQualityReadProjections, qualityReadRelation } from './quality-read-projection';

/** Fixed SQL scope shared by summary and evidence. Values are always bound. */
export function qualityReadScope(filters: DashboardCdrFilters, isAdmin: boolean, userId: string, preview = false, relation?: string) {
    const clauses = ['1=1'];
    const replacements: Record<string, any> = {};
    if (!isAdmin || filters.userId) {
        clauses.push('c."userId" = :owner');
        replacements.owner = !isAdmin ? String(userId) : String(filters.userId);
    }
    if (filters.withoutProject) clauses.push('c."projectId" IS NULL');
    else if (filters.projectId != null) {
        clauses.push('c."projectId" = :project');
        replacements.project = filters.projectId;
    }
    if (filters.operatorId) {
        clauses.push('c."operatorId" = :operator');
        replacements.operator = filters.operatorId;
    } else if (filters.operatorNameExact) {
        clauses.push('c."assistantName" = :name');
        replacements.name = filters.operatorNameExact;
    } else if (filters.operatorName) {
        clauses.push('c."assistantName" ILIKE :name');
        replacements.name = `%${filters.operatorName}%`;
    }
    for (const [key, op, boundary] of [
        ['startDate', '>=', 'start'],
        ['endDate', '<=', 'end'],
    ] as const) {
        if (filters[key]) {
            clauses.push(`c."createdAt" ${op} :${key}`);
            replacements[key] = analyticsDate(filters[key], boundary);
        }
    }
    appendAnalyticsSelectionSql('postgres', 'c', filters, clauses, replacements);
    const raw = postgresJsonbCast('a.metrics');
    const sources = journalValues(filters.sources, ['call', 'widget', 'playground', 'external-api', 'external-front']);
    const types = journalValues(filters.callTypes, ['incoming', 'outgoing', 'internal']);
    if (sources.length) { clauses.push('c.source IN (:qualitySources)'); replacements.qualitySources = sources; }
    if (types.length) { clauses.push(`COALESCE(c."callType",'incoming') IN (:qualityTypes)`); replacements.qualityTypes = types; }
    const people = journalPeople(filters.people);
    if (people.length) clauses.push('(' + people.map((person, i) => {
        const bind = (column: string, value: string) => {
            const key = `qualityPerson${i}${column}`; replacements[key] = value;
            return `c."${column}" = :${key}`;
        };
        const identity = person.operatorId ? bind('operatorId', person.operatorId) : person.assistantId ? bind('assistantId', person.assistantId)
            : `${bind('assistantName', person.name!)} AND COALESCE(c."operatorId",'')='' AND COALESCE(c."assistantId",'') IN ('','0')`;
        return `(${bind('userId', person.userId)} AND ${identity})`;
    }).join(' OR ') + ')');
    const selectedTags = journalTags(filters.tagIds);
    if (selectedTags.length) {
        replacements.qualityTags = selectedTags;
        clauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(${raw}->'_topics'->'tags')='array' THEN ${raw}->'_topics'->'tags' ELSE '[]'::jsonb END) tag(value) WHERE tag.value IN (:qualityTags))`);
    }
    const { scores, includeNone } = parseCsatFilter(filters.csat);
    if (scores.length || includeNone) {
        replacements.qualityCsat = scores;
        clauses.push('(' + [...(scores.length ? ['a.csat IN (:qualityCsat)'] : []), ...(includeNone ? ['a.csat IS NULL'] : [])].join(' OR ') + ')');
    }
    const usable = `COALESCE(${raw}->'_quality'->>'quality', 'ok') NOT IN ('low','unusable')`;
    const cte = `WITH base AS MATERIALIZED (
        SELECT c."channelId", c."userId", c."createdAt", c.duration, c.cost, c."amountCurrency",
          c."operatorId", COALESCE(NULLIF(c."assistantName", ''), 'Unknown Operator') AS name,
          COALESCE(c."callType", 'incoming') AS type, a."qualityRunId", a."qualityScorecardId",
          a."qualityCoverage", a."qualityContextIncomplete", ${raw} AS metrics,
          ${usable} AS usable,
          CASE WHEN a."qualityStatus"='scored' AND ${usable} ${preview ? `AND a."qualityVersion"='${QUALITY_FORMULA_VERSION}'` : ''} THEN a."qualityScore" ELSE NULL END AS score,
          CASE WHEN ${usable} THEN COALESCE(a."qualitySummary"::jsonb->>'success', ${raw}->'scenario_analysis'->>'success', ${raw}->>'success') END AS success,
          CASE WHEN ${usable} THEN lower(COALESCE(a."qualitySummary"::jsonb->>'sentiment', a.sentiment, ${raw}->>'customer_sentiment')) END AS mood,
          CASE WHEN ${usable} THEN a.csat END AS csat
          , CASE WHEN a."qualitySummary"::jsonb ? 'successReason' THEN a."qualitySummary"::jsonb->>'successReason' ELSE ${raw}->'_assessments'->'success'->>'rationale' END AS "failureReason"
        FROM "aiCdr" c LEFT JOIN ${relation ?? `"${preview ? 'quality_preview_analytics' : 'aiAnalytics'}"`} a ON a."channelId"=c."channelId"
        WHERE ${clauses.join(' AND ')}
    )`;
    return { cte, replacements };
}

/** Correlated predicate for an already-authorized/paginated CDR query; never transfers period IDs. */
export function qualityDistributionPredicate(filter: { sentiment?: string | null; success?: boolean | null; withoutOutcome?: boolean }, preview = false): string {
    if (filter.withoutOutcome && typeof filter.success === 'boolean') throw new Error('Conflicting outcome filters');
    if (filter.withoutOutcome && filter.sentiment) return `(${qualityDistributionPredicate({ withoutOutcome: true }, preview)} AND ${qualityDistributionPredicate({ sentiment: filter.sentiment }, preview)})`;
    const metrics = postgresJsonbCast('q.metrics');
    const parts = [
        `q."channelId"="AiCdr"."channelId"`,
        `COALESCE(${metrics}->'_quality'->>'quality','ok') NOT IN ('low','unusable')`,
    ];
    if (filter.sentiment) {
        if (!['positive', 'neutral', 'negative'].includes(filter.sentiment)) throw new Error('Invalid sentiment');
        parts.push(
            `lower(COALESCE(q."qualitySummary"::jsonb->>'sentiment',q.sentiment,${metrics}->>'customer_sentiment'))='${filter.sentiment}'`
        );
    }
    if (typeof filter.success === 'boolean')
        parts.push(
            `COALESCE(q."qualitySummary"::jsonb->>'success',${metrics}->'scenario_analysis'->>'success',${metrics}->>'success')='${
                filter.success ? 'true' : 'false'
            }'`
        );
    if (filter.withoutOutcome) parts.push(`COALESCE(q."qualitySummary"::jsonb->>'success',${metrics}->'scenario_analysis'->>'success',${metrics}->>'success') IN ('true','false')`);
    return `${filter.withoutOutcome ? 'NOT ' : ''}EXISTS (SELECT 1 FROM "${preview ? 'quality_preview_analytics' : 'aiAnalytics'}" q WHERE ${parts.join(' AND ')})`;
}

const counts = `count(*)::int AS "callsCount", count(score)::int AS "scoredCalls", avg(score) AS "averageScore", avg(duration) AS "averageDuration",
    COALESCE(100.0 * count(*) FILTER (WHERE success='true') / NULLIF(count(*) FILTER (WHERE success IN ('true','false')),0),0) AS "successRate",
    avg(csat) AS "avgCsat", count(*) FILTER (WHERE mood='positive')::int AS positive,
    count(*) FILTER (WHERE mood='neutral')::int AS neutral, count(*) FILTER (WHERE mood='negative')::int AS negative`;
const jsonRows = (sql: string) => `(SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]'::jsonb) FROM (${sql}) g)`;

/** PostgreSQL groups the full selection after resolving historical numeric projections. */
export async function qualityDashboard(
    db: Sequelize,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    userId: string,
    taxonomy: Array<{ id: string; name: string }> = [],
    preview = false
) {
    if (db.getDialect() !== 'postgres') throw new Error('Quality v2 aggregate activation requires PostgreSQL');
    const resolved = preview ? await loadQualityReadProjections(db, { ...filters, userId: isAdmin ? filters.userId : userId }) : {};
    const { cte, replacements } = qualityReadScope(filters, isAdmin, userId, preview, preview ? qualityReadRelation(db, resolved) : undefined);
    const hourRange =
        filters.startDate && filters.endDate
            ? analyticsDate(filters.endDate, 'end').getTime() - analyticsDate(filters.startDate, 'start').getTime()
            : Infinity;
    const periods = (
        unit: string,
        format: string
    ) => `SELECT to_char(date_trunc('${unit}', "createdAt" AT TIME ZONE 'UTC'), '${format}') AS label,
        ${counts}, jsonb_build_object('incoming',count(*) FILTER (WHERE type='incoming'),'outgoing',count(*) FILTER (WHERE type='outgoing'),'internal',count(*) FILTER (WHERE type='internal')) AS "byCallType"
        FROM base GROUP BY 1 ORDER BY 1`;
    const tags = `SELECT b.*, tag.value AS tag FROM base b LEFT JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(b.metrics->'_topics'->'tags')='array' THEN b.metrics->'_topics'->'tags' ELSE '[]'::jsonb END) tag(value) ON true`;
    const sql = `${cte}, tagged AS (${tags}) SELECT
      (SELECT to_jsonb(g) FROM (SELECT ${counts}, COALESCE(sum(cost),0) AS "totalCost", sum("amountCurrency") AS "totalAmountCurrency",
       count(*) FILTER (WHERE NOT usable)::int AS "excludedLowQualityCount", count(*) FILTER (WHERE success='false')::int AS "unsuccessfulCount", count(*) FILTER (WHERE success='true')::int AS "successfulCount",
       count(DISTINCT "qualityScorecardId")::int AS "scorecardRevisions", count(*) FILTER (WHERE "qualityContextIncomplete")::int AS "historicalDerivedCalls" FROM base) g) AS totals,
      ${jsonRows(
          `SELECT "userId" AS "operatorAccountId", "operatorId", (array_agg(name ORDER BY "createdAt" DESC))[1] AS "operatorName", ${counts} FROM base GROUP BY "userId", "operatorId", CASE WHEN COALESCE("operatorId",'')='' THEN name ELSE '' END`
      )} AS agents,
      ${jsonRows(periods('day', 'YYYY-MM-DD'))} AS daily,
      ${jsonRows(periods('month', 'YYYY-MM'))} AS monthly,
      ${jsonRows(periods('year', 'YYYY'))} AS yearly,
      ${
          hourRange >= 0 && hourRange <= 25 * 3600000
              ? jsonRows(periods('hour', 'YYYY-MM-DD"T"HH24:00:00.000"Z"'))
              : "'[]'::jsonb"
      } AS hourly,
      ${jsonRows(`SELECT v."metricId", v.origin, avg(COALESCE(v."numValue",CASE WHEN v."boolValue" THEN 100 WHEN v."boolValue"=false THEN 0 END)) AS value,
        v."strValue", count(*)::int AS n, avg(v."normalizedValue")*100 AS normalized
        FROM base b JOIN ${preview ? 'quality_preview_values' : 'operator_metric_values'} v ON v."channelId"=b."channelId" AND v."userId"=b."userId" AND v."qualityRunId"=b."qualityRunId"
        WHERE b.usable AND v."qualityStatus"='assessed' GROUP BY v."metricId",v.origin,v."strValue"`)} AS metrics,
      ${jsonRows(`SELECT tag, ${counts} FROM tagged GROUP BY tag`)} AS tags,
      ${jsonRows(
          `SELECT "userId", "operatorId", CASE WHEN COALESCE("operatorId",'')='' THEN name ELSE '' END AS name, tag, count(*)::int AS n FROM tagged GROUP BY 1,2,3,4`
      )} AS cells,
      ${jsonRows(
          `SELECT left(trim("failureReason"),500) AS reason, count(*)::int AS count, (array_agg("channelId" ORDER BY "createdAt" DESC))[1:3] AS "channelIds" FROM base WHERE success='false' AND length(trim(COALESCE("failureReason",'')))>0 GROUP BY 1 ORDER BY count(*) DESC,1 LIMIT 8`
      )} AS failures,
      (SELECT COALESCE(max(jsonb_array_length(CASE WHEN jsonb_typeof(metrics->'_topics'->'tags')='array' THEN metrics->'_topics'->'tags' ELSE '[]'::jsonb END)),0)>1 FROM base) AS multiple`;
    const [row] = await db.query<any>(sql, { replacements, type: QueryTypes.SELECT });
    const total = row.totals;
    const percent = (n: number, d: number) => (d ? (100 * n) / d : 0);
    const sentiment = (g: any) => {
        const n = g.positive + g.neutral + g.negative;
        return { positive: percent(g.positive, n), neutral: percent(g.neutral, n), negative: percent(g.negative, n) };
    };
    const series = (data: any[]) =>
        data.map((g) => ({
            label: g.label,
            callsCount: g.callsCount,
            scoredCalls: g.scoredCalls,
            avgScore: g.averageScore,
            avgDuration: g.averageDuration ?? 0,
            byCallType: g.byCallType,
        }));
    let hourly: any[] = [];
    if (filters.startDate && filters.endDate) {
        const from = analyticsDate(filters.startDate, 'start').getTime(),
            to = analyticsDate(filters.endDate, 'end').getTime();
        if (to >= from && to - from <= 25 * 3600000) {
            const found = new Map(series(row.hourly).map((p) => [p.label, p]));
            for (let t = Math.floor(from / 3600000) * 3600000; t <= to; t += 3600000) {
                const label = new Date(t).toISOString();
                hourly.push(
                    found.get(label) ?? {
                        label,
                        callsCount: 0,
                        scoredCalls: 0,
                        avgScore: null,
                        avgDuration: 0,
                        byCallType: { incoming: 0, outgoing: 0, internal: 0 },
                    }
                );
            }
        }
    }
    const aggregatedMetrics: Record<string, number> = {},
        customMetricsAggregated: Record<string, any> = {};
    for (const m of row.metrics) {
        if (m.origin === 'default' && m.normalized != null) aggregatedMetrics[m.metricId] = m.normalized;
        if (m.origin === 'custom') {
            if (m.strValue != null) {
                const metric = (customMetricsAggregated[m.metricId] ??= { type: 'enum', distribution: {} });
                metric.distribution[m.strValue] = m.n;
            } else customMetricsAggregated[m.metricId] = { type: 'number', value: m.value, normalized: m.normalized };
        }
    }
    const name = (tag: string | null) => (tag == null ? 'Без темы' : taxonomy.find((t) => t.id === tag)?.name ?? tag);
    const topicRows = row.tags.filter((g: any) => g.tag != null || g.callsCount > 0);
    const operators = row.agents.map((g: any) => ({
        ...g,
        negativeRate: percent(g.negative, g.positive + g.neutral + g.negative),
        topics: row.cells
            .filter(
                (c: any) =>
                    c.userId === g.operatorAccountId &&
                    (c.operatorId || '') === (g.operatorId || '') &&
                    (g.operatorId || c.name === g.operatorName)
            )
            .map((c: any) => ({ tagId: c.tag, callsCount: c.n })),
    }));
    return {
        totalAnalyzed: total.callsCount,
        totalCost: total.totalCost,
        totalAmountCurrency: total.totalAmountCurrency,
        averageDuration: total.averageDuration ?? 0,
        averageScore: total.averageScore,
        scoredCalls: total.scoredCalls,
        qualityVersion: QUALITY_FORMULA_VERSION,
        scorecardRevisions: total.scorecardRevisions,
        historicalDerivedCalls: total.historicalDerivedCalls,
        successRate: total.successRate,
        aggregatedMetrics,
        customMetricsAggregated,
        sentimentDistribution: sentiment(total),
        excludedLowQualityCount: total.excludedLowQualityCount,
        unsuccessfulCount: total.unsuccessfulCount,
        successfulCount: total.successfulCount,
        unknownOutcomeCount: total.callsCount - total.successfulCount - total.unsuccessfulCount,
        failureReasons: row.failures.map((g: any) => ({
            ...g,
            shareOfUnsuccessful: percent(g.count, total.unsuccessfulCount),
        })),
        insightsAvailable: total.scoredCalls >= 10,
        agentScorecards: operators,
        timeSeries: { daily: series(row.daily), monthly: series(row.monthly), yearly: series(row.yearly), hourly },
        operatorTopicStats: {
            totalCalls: total.callsCount,
            hasMultipleTopics: row.multiple,
            topics: topicRows.map((g: any) => ({ tagId: g.tag, name: name(g.tag), callsCount: g.callsCount })),
            operators,
        },
        tagStats: topicRows
            .filter((g: any) => g.tag != null)
            .map((g: any) => ({
                tagId: g.tag,
                name: name(g.tag),
                callsCount: g.callsCount,
                scoredCalls: g.scoredCalls,
                averageScore: g.averageScore,
                successRate: g.successRate,
                sentiment: sentiment(g),
                shareOfPeriodCalls: percent(g.callsCount, total.callsCount),
            })),
    };
}

/** Aggregate first, then a bounded evidence page per criterion; no full CDR/transcript fetch. */
export async function qualityEvidence(
    db: Sequelize,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    userId: string,
    query: {
        order?: string;
        metricId?: string;
        evidencePage?: number;
        evidencePageSize?: number;
        operatorName?: string;
        operatorId?: string;
    },
    preview = false
) {
    if (db.getDialect() !== 'postgres') throw new Error('Quality v2 evidence activation requires PostgreSQL');
    const resolved = preview ? await loadQualityReadProjections(db, { ...filters, userId: isAdmin ? filters.userId : userId }) : {};
    const { cte, replacements } = qualityReadScope(filters, isAdmin, userId, preview, preview ? qualityReadRelation(db, resolved) : undefined);
    const page = Math.max(1, Number(query.evidencePage) || 1),
        size = Math.max(1, Math.min(100, Number(query.evidencePageSize) || 20));
    Object.assign(replacements, { offset: (page - 1) * size, last: page * size, metricId: query.metricId ?? null });
    const direction = query.order === 'best' ? 'DESC' : 'ASC';
    const sql = `${cte}, vals AS MATERIALIZED (
      SELECT v."channelId",v."metricId",v.origin,v."numValue",v."boolValue",v."strValue",v."normalizedValue", b."createdAt", r.result::jsonb AS result,
        row_number() OVER (PARTITION BY v.origin,v."metricId" ORDER BY COALESCE(v."normalizedValue"*100,v."numValue",CASE WHEN v."boolValue" THEN 100 WHEN v."boolValue"=false THEN 0 END) ${direction} NULLS LAST,b."createdAt" DESC,b."channelId") AS rn
      FROM base b JOIN ${preview ? 'quality_preview_values' : 'operator_metric_values'} v ON v."channelId"=b."channelId" AND v."userId"=b."userId" AND v."qualityRunId"=b."qualityRunId"
      JOIN ${preview ? 'quality_preview_runs' : 'quality_analysis_runs'} r ON r.id=b."qualityRunId" AND r."userId"=b."userId"
      WHERE b.usable AND v."qualityStatus"='assessed'
    ) SELECT
      (SELECT to_jsonb(t) FROM (SELECT count(*)::int AS "callsCount",count(score)::int AS "scoredCalls",avg(score) AS "averageScore" FROM base) t) AS totals,
      ${jsonRows(
          `SELECT origin,"metricId",count(*)::int AS n,avg("normalizedValue")*100 AS "normalizedAverage",avg(COALESCE("numValue",CASE WHEN "boolValue" THEN 100 WHEN "boolValue"=false THEN 0 END)) AS average FROM vals GROUP BY origin,"metricId"`
      )} AS metrics,
      ${jsonRows(`SELECT "channelId","createdAt",origin,"metricId","normalizedValue"*100 AS "normalizedScore",COALESCE(to_jsonb("numValue"),to_jsonb("boolValue"),to_jsonb("strValue")) AS value,
        (SELECT c->>'rationale' FROM jsonb_array_elements(result->'criteria') c WHERE c->>'id'="metricId" AND c->>'origin'=origin LIMIT 1) AS rationale,
        (SELECT c->>'quote' FROM jsonb_array_elements(result->'criteria') c WHERE c->>'id'="metricId" AND c->>'origin'=origin LIMIT 1) AS quote
        FROM vals WHERE rn>:offset AND rn<=:last AND (:metricId IS NULL OR "metricId"=:metricId) ORDER BY origin,"metricId",rn`)} AS evidence`;
    const [row] = await db.query<any>(sql, { replacements, type: QueryTypes.SELECT });
    return {
        ...row.totals,
        operatorName: query.operatorName || 'all',
        ...(query.operatorId ? { operatorId: query.operatorId } : {}),
        qualityVersion: QUALITY_FORMULA_VERSION,
        sampleCapped: false,
        metrics: row.metrics.map((m: any) => ({
            metricId: m.metricId,
            origin: m.origin,
            average: m.average,
            normalizedAverage: m.normalizedAverage,
            sampleSize: m.n,
            evidenceTotal: m.n,
            evidencePage: page,
            evidencePageSize: size,
            evidence: row.evidence
                .filter((e: any) => e.metricId === m.metricId && e.origin === m.origin)
                .map(({ metricId, origin, ...e }: any) => e),
        })),
    };
}
