import { QueryTypes, type Sequelize } from 'sequelize';
import type { DashboardCdrFilters } from './dashboard-aggregation';
import { qualityReadScope } from '../quality/quality-dashboard';
import { loadQualityReadProjections, qualityReadRelation } from '../quality/quality-read-projection';
import type { CriterionRule } from '../quality/quality-score';

export interface InsightMetricGroup {
    metricId: string; origin: 'default' | 'custom'; rule: CriterionRule;
    status: string; category: string | null; n: number;
    average: number | null; normalized: number | null; trueCount: number;
    lowIds: string[]; highIds: string[];
    definition?: unknown;
}
export interface InsightPeriodData {
    total: number; scored: number; score: number | null;
    scorecards: string[]; coverage: number | null; historical: number;
    metrics: InsightMetricGroup[];
    lowIds?: string[]; highIds?: string[];
}

/** Same authorized CTE as the dashboard; join only the CURRENT run and the owner's frozen rule. */
export async function insightPeriodData(db: Sequelize, filters: DashboardCdrFilters, admin: boolean, owner: string): Promise<InsightPeriodData> {
    if (db.getDialect() !== 'postgres') throw new Error('Verified insights require PostgreSQL');
    const resolved = await loadQualityReadProjections(db, { ...filters, userId: admin ? filters.userId : owner });
    const { cte, replacements } = qualityReadScope(filters, admin, owner, true, qualityReadRelation(db, resolved));
    const [row] = await db.query<InsightPeriodData>(`${cte}, metric_rows AS (
        SELECT b."channelId", v."metricId", v.origin, v."qualityStatus" AS status,
          COALESCE(v."strValue", CASE WHEN v."boolValue" IS NOT NULL THEN v."boolValue"::text END) AS category, v."numValue" AS number, v."boolValue" AS boolean,
          v."normalizedValue" AS normalized, rule.item AS rule,
          jsonb_build_object('business',s.snapshot::jsonb->'context'->'systemPrompt',
            'criterion',(SELECT d.item FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.snapshot::jsonb->'context'->'customMetricsSchema')='array' THEN s.snapshot::jsonb->'context'->'customMetricsSchema' ELSE '[]'::jsonb END) d(item) WHERE v.origin='custom' AND d.item->>'id'=v."metricId" LIMIT 1),
            'topics',s.snapshot::jsonb->'context'->'callTaxonomy') AS definition
        FROM base b JOIN quality_preview_values v ON v."channelId"=b."channelId"
          AND v."userId"=b."userId" AND v."qualityRunId"=b."qualityRunId"
        JOIN quality_preview_scorecards s ON s.id=b."qualityScorecardId" AND s."userId"=b."userId"
        JOIN LATERAL jsonb_array_elements(s.snapshot::jsonb->'criteria') rule(item)
          ON rule.item->>'id'=v."metricId" AND rule.item->>'origin'=v.origin
        WHERE v.origin IN ('default','custom') AND b.usable
    ), grouped AS (
        SELECT "metricId", origin, rule, definition, status, category, count(*)::int AS n,
          avg(number) AS average, avg(normalized)*100 AS normalized,
          count(*) FILTER (WHERE boolean=true)::int AS "trueCount",
          (array_agg("channelId" ORDER BY normalized ASC NULLS LAST,"channelId"))[1:5] AS "lowIds",
          (array_agg("channelId" ORDER BY normalized DESC NULLS LAST,"channelId"))[1:5] AS "highIds"
        FROM metric_rows GROUP BY "metricId",origin,rule,definition,status,category
    ) SELECT
      (SELECT count(*)::int FROM base) AS total,
      (SELECT count(score)::int FROM base) AS scored,
      (SELECT avg(score) FROM base) AS score,
      (SELECT (array_agg("channelId" ORDER BY score ASC,"channelId"))[1:5] FROM base WHERE score IS NOT NULL) AS "lowIds",
      (SELECT (array_agg("channelId" ORDER BY score DESC,"channelId"))[1:5] FROM base WHERE score IS NOT NULL) AS "highIds",
      (SELECT avg("qualityCoverage") FROM base) AS coverage,
      (SELECT count(*)::int FROM base WHERE "qualityContextIncomplete") AS historical,
      (SELECT COALESCE(jsonb_agg(DISTINCT "qualityScorecardId") FILTER (WHERE "qualityScorecardId" IS NOT NULL),'[]') FROM base) AS scorecards,
      (SELECT COALESCE(jsonb_agg(to_jsonb(g)), '[]') FROM grouped g) AS metrics`, { replacements, type: QueryTypes.SELECT });
    row.metrics = row.metrics.map((metric: InsightMetricGroup) => ({ ...metric, rule: { ...metric.rule,
        included: metric.origin === 'custom' && metric.rule.normalization.kind !== 'none' ? true : metric.rule.included } }));
    return row;
}
