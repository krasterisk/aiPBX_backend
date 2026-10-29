import { QueryTypes, Sequelize } from 'sequelize';
import { analyticsDate } from '../lib/analytics-date';
import { calculateQualityScore, QUALITY_FORMULA_VERSION, QualityScorecard } from './quality-score';

/** The same policy upgrade for persisted detail revisions and read-only projections. */
export function appliedQualityScorecard(snapshot: QualityScorecard): QualityScorecard {
    return {
        ...snapshot,
        formulaVersion: QUALITY_FORMULA_VERSION,
        criteria: snapshot.criteria.map(rule => ({
            ...rule,
            included: rule.origin === 'custom' && rule.normalization.kind !== 'none' ? true : rule.included,
        })),
    };
}

type Projection = {
    qualityScore: number | null;
    qualityStatus: string;
    qualityVersion: string;
    qualityCoverage: number;
    qualityContextIncomplete: boolean;
};
export type QualityReadProjections = Record<string, Projection>;
const caches = new WeakMap<Sequelize, Map<string, Projection>>();

/** No writes, LLM calls or mutable-answer cache. Immutable run IDs invalidate naturally. */
export async function loadQualityReadProjections(db: Sequelize, scope: {
    userId?: string; projectId?: number | string; withoutProject?: boolean | string;
    startDate?: string; endDate?: string;
}): Promise<QualityReadProjections> {
    if (db.getDialect() !== 'postgres') return {};
    const clauses = ['a."qualityVersion" IS DISTINCT FROM :version', 'a."qualityRunId" IS NOT NULL'];
    const replacements: Record<string, unknown> = { version: QUALITY_FORMULA_VERSION };
    if (scope.userId != null) { clauses.push('c."userId"=:owner'); replacements.owner = String(scope.userId); }
    if (scope.withoutProject === true || scope.withoutProject === 'true') clauses.push('c."projectId" IS NULL');
    else if (scope.projectId != null && String(scope.projectId) !== '' && String(scope.projectId) !== 'all') {
        clauses.push('c."projectId"=:project'); replacements.project = scope.projectId;
    }
    for (const [key, operator, boundary] of [['startDate', '>=', 'start'], ['endDate', '<=', 'end']] as const) {
        if (scope[key]) {
            clauses.push(`c."createdAt" ${operator} :${key}`);
            replacements[key] = analyticsDate(scope[key], boundary);
        }
    }
    const ids = await db.query<{ id: string; userId: string }>(`
        SELECT DISTINCT a."qualityRunId" AS id, c."userId" FROM "quality_preview_analytics" a
        JOIN "aiCdr" c ON c."channelId"=a."channelId" WHERE ${clauses.join(' AND ')}
    `, { type: QueryTypes.SELECT, replacements });
    let cache = caches.get(db);
    if (!cache) { cache = new Map(); caches.set(db, cache); }
    const result: QualityReadProjections = {};
    const pending = ids.filter(row => {
        const value = cache.get(`${row.userId}:${row.id}`);
        if (value) result[row.id] = value;
        return !value;
    });
    // Bound raw snapshots in memory; only numeric projections survive each batch.
    for (let offset = 0; offset < pending.length; offset += 250) {
        const batch = pending.slice(offset, offset + 250);
        const owners = new Map(batch.map(row => [row.id, row.userId]));
        const rows = await db.query<{ id: string; userId: string; snapshot: QualityScorecard; metrics: Record<string, unknown>; overrides: Parameters<typeof calculateQualityScore>[2] }>(`
            SELECT r.id, r."userId", s.snapshot, r."rawSnapshot"::jsonb->'metrics' AS metrics,
                r."rawSnapshot"::jsonb->'overrides' AS overrides
            FROM "quality_preview_runs" r JOIN "quality_preview_scorecards" s
                ON s.id=r."scorecardRevisionId" AND s."userId"=r."userId"
            WHERE r.id IN (:ids)
        `, { type: QueryTypes.SELECT, replacements: { ids: batch.map(row => row.id) } });
        for (const row of rows) {
            if (String(row.userId) !== String(owners.get(row.id))) throw new Error('Quality read scope mismatch');
            const score = calculateQualityScore(appliedQualityScorecard(row.snapshot), row.metrics, row.overrides ?? []);
            const value: Projection = {
                qualityScore: score.score, qualityStatus: score.status, qualityVersion: score.formulaVersion,
                qualityCoverage: score.coverage, qualityContextIncomplete: score.contextIncomplete,
            };
            result[row.id] = value;
            cache.set(`${row.userId}:${row.id}`, value);
            if (cache.size > 10000) cache.delete(cache.keys().next().value!);
        }
    }
    return result;
}

/** Keep grouping, pagination and ordering in PostgreSQL using the resolved numeric projections. */
export function qualityReadRelation(db: Sequelize, projections: QualityReadProjections): string {
    if (!Object.keys(projections).length) return '"quality_preview_analytics"';
    return `(SELECT (jsonb_populate_record(p, COALESCE(o.value, '{}'::jsonb))).*
        FROM "quality_preview_analytics" p LEFT JOIN jsonb_each(${db.escape(JSON.stringify(projections))}::jsonb) o
        ON o.key=p."qualityRunId")`;
}

export function qualityReadOrder(db: Sequelize, projections: QualityReadProjections, alias: string): string {
    if (!Object.keys(projections).length) return `CASE WHEN "${alias}"."qualityVersion"='${QUALITY_FORMULA_VERSION}' AND "${alias}"."qualityStatus"='scored' THEN "${alias}"."qualityScore" ELSE NULL END`;
    const values = db.escape(JSON.stringify(projections));
    const resolved = `(${values}::jsonb -> "${alias}"."qualityRunId")`;
    return `CASE WHEN ${resolved} IS NOT NULL THEN (${resolved}->>'qualityScore')::double precision
        WHEN "${alias}"."qualityVersion"='${QUALITY_FORMULA_VERSION}' AND "${alias}"."qualityStatus"='scored'
        THEN "${alias}"."qualityScore" ELSE NULL END`;
}
