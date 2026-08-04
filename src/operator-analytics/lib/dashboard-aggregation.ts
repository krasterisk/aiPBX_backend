import { Op, Sequelize } from 'sequelize';
import { ALL_DEFAULT_METRIC_KEYS } from '../interfaces/operator-metrics.interface';

export interface DashboardCdrFilters {
    userId?: string;
    projectId?: number;
    startDate?: string;
    endDate?: string;
    operatorName?: string;
    operatorNameExact?: string;
}

export function buildDashboardCdrWhere(
    query: DashboardCdrFilters,
    isAdmin: boolean,
    realUserId: string,
    likeOp: (value: string) => Record<string, string>,
): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (!isAdmin) {
        where.userId = String(realUserId);
    } else if (query.userId) {
        where.userId = query.userId;
    }

    if (query.startDate && query.endDate) {
        where.createdAt = {
            [Op.between]: [
                new Date(`${query.startDate}T00:00:00`),
                new Date(`${query.endDate}T23:59:59`),
            ],
        };
    } else if (query.startDate) {
        where.createdAt = { [Op.gte]: new Date(`${query.startDate}T00:00:00`) };
    } else if (query.endDate) {
        where.createdAt = { [Op.lte]: new Date(`${query.endDate}T23:59:59`) };
    }

    if (query.operatorNameExact) {
        where.assistantName = query.operatorNameExact;
    } else if (query.operatorName) {
        where.assistantName = likeOp(`%${query.operatorName}%`);
    }

    if (query.projectId) {
        where.projectId = query.projectId;
    }

    return where;
}

function q(name: string, dialect: string): string {
    return dialect === 'postgres' ? `"${name}"` : `\`${name}\``;
}

function qualityJsonExpr(dialect: string, analyticsAlias: string): string {
    if (dialect === 'postgres') {
        return `${analyticsAlias}.${q('metrics', dialect)}::jsonb->'_quality'->>'quality'`;
    }
    return `JSON_UNQUOTE(JSON_EXTRACT(${analyticsAlias}.${q('metrics', dialect)}, '$._quality.quality'))`;
}

export async function countLowQualityCdrs(
    sequelize: Sequelize,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    realUserId: string,
): Promise<number> {
    const dialect = sequelize.getDialect();
    const c = 'c';
    const a = 'a';
    const replacements: Record<string, unknown> = {};
    const clauses: string[] = ['1=1'];

    if (!isAdmin) {
        clauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = String(realUserId);
    } else if (filters.userId) {
        clauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = filters.userId;
    }

    if (filters.projectId != null) {
        clauses.push(`${c}.${q('projectId', dialect)} = :projectId`);
        replacements.projectId = filters.projectId;
    }
    if (filters.operatorNameExact) {
        clauses.push(`${c}.${q('assistantName', dialect)} = :operatorNameExact`);
        replacements.operatorNameExact = filters.operatorNameExact;
    } else if (filters.operatorName) {
        const op = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
        clauses.push(`${c}.${q('assistantName', dialect)} ${op} :operatorName`);
        replacements.operatorName = `%${filters.operatorName}%`;
    }
    if (filters.startDate && filters.endDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} BETWEEN :from AND :to`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    } else if (filters.startDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} >= :from`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
    } else if (filters.endDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} <= :to`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    }

    const qualityExpr = qualityJsonExpr(dialect, a);
    const sql = `
        SELECT COUNT(*) AS cnt
        FROM ${q('aiCdr', dialect)} ${c}
        INNER JOIN ${q('aiAnalytics', dialect)} ${a}
            ON ${a}.${q('channelId', dialect)} = ${c}.${q('channelId', dialect)}
        WHERE ${clauses.join(' AND ')}
          AND ${qualityExpr} IN ('low', 'unusable')
    `;

    const [rows] = await sequelize.query(sql, { replacements, type: 'SELECT' as any });
    if (!rows) return 0;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return Number((row as { cnt?: number | string })?.cnt ?? 0);
}

export interface MetricSqlAggregates {
    numericAverages: Record<string, number>;
    aggregationCount: number;
    successCount: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    usedSql: boolean;
}

export async function aggregateMetricsFromSql(
    sequelize: Sequelize,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    realUserId: string,
    excludeLowQuality: boolean,
): Promise<MetricSqlAggregates> {
    const empty: MetricSqlAggregates = {
        numericAverages: {},
        aggregationCount: 0,
        successCount: 0,
        positiveCount: 0,
        neutralCount: 0,
        negativeCount: 0,
        usedSql: false,
    };

    const dialect = sequelize.getDialect();
    const c = 'c';
    const mv = 'mv';
    const a = 'a';
    const replacements: Record<string, unknown> = {};
    const cdrClauses: string[] = ['1=1'];

    if (!isAdmin) {
        cdrClauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = String(realUserId);
    } else if (filters.userId) {
        cdrClauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = filters.userId;
    }

    if (filters.projectId != null) {
        cdrClauses.push(`${c}.${q('projectId', dialect)} = :projectId`);
        replacements.projectId = filters.projectId;
    }
    if (filters.operatorNameExact) {
        cdrClauses.push(`${c}.${q('assistantName', dialect)} = :operatorNameExact`);
        replacements.operatorNameExact = filters.operatorNameExact;
    } else if (filters.operatorName) {
        const op = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
        cdrClauses.push(`${c}.${q('assistantName', dialect)} ${op} :operatorName`);
        replacements.operatorName = `%${filters.operatorName}%`;
    }
    if (filters.startDate && filters.endDate) {
        cdrClauses.push(`${c}.${q('createdAt', dialect)} BETWEEN :from AND :to`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    } else if (filters.startDate) {
        cdrClauses.push(`${c}.${q('createdAt', dialect)} >= :from`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
    } else if (filters.endDate) {
        cdrClauses.push(`${c}.${q('createdAt', dialect)} <= :to`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    }

    let qualityJoin = '';
    if (excludeLowQuality) {
        qualityJoin = `
            INNER JOIN ${q('aiAnalytics', dialect)} ${a}
                ON ${a}.${q('channelId', dialect)} = ${c}.${q('channelId', dialect)}
        `;
        const qualityExpr = qualityJsonExpr(dialect, a);
        cdrClauses.push(`(${qualityExpr} IS NULL OR ${qualityExpr} NOT IN ('low', 'unusable'))`);
    }

    const defaultKeys = ALL_DEFAULT_METRIC_KEYS as readonly string[];
    const defaultList = defaultKeys.map(k => `'${k}'`).join(', ');

    const sql = `
        SELECT
            mv.${q('metricId', dialect)} AS "metricId",
            AVG(mv.${q('numValue', dialect)}) AS "avgNum",
            SUM(CASE WHEN mv.${q('boolValue', dialect)} = ${dialect === 'postgres' ? 'TRUE' : '1'} THEN 1 ELSE 0 END) AS "trueCount",
            COUNT(DISTINCT mv.${q('channelId', dialect)}) AS "channelCount",
            mv.${q('strValue', dialect)} AS "strValue",
            COUNT(*) AS "rowCount"
        FROM ${q('operator_metric_values', dialect)} mv
        INNER JOIN ${q('aiCdr', dialect)} ${c}
            ON ${c}.${q('channelId', dialect)} = mv.${q('channelId', dialect)}
        ${qualityJoin}
        WHERE ${cdrClauses.join(' AND ')}
          AND (
            (mv.${q('origin', dialect)} = 'default' AND mv.${q('metricId', dialect)} IN (${defaultList}))
            OR mv.${q('metricId', dialect)} IN ('success', 'customer_sentiment', 'csat')
          )
        GROUP BY mv.${q('metricId', dialect)}, mv.${q('strValue', dialect)}
    `;

    const [rows] = await sequelize.query(sql, { replacements });
    if (!Array.isArray(rows) || rows.length === 0) {
        return empty;
    }

    const numericSums: Record<string, { sum: number; count: number }> = {};
    for (const key of defaultKeys) {
        numericSums[key] = { sum: 0, count: 0 };
    }

    let successCount = 0;
    let successTotal = 0;
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;
    let sentimentTotal = 0;
    let channelCount = 0;

    for (const raw of rows as Array<Record<string, unknown>>) {
        const metricId = String(raw.metricId ?? '');
        const avgNum = raw.avgNum != null ? Number(raw.avgNum) : null;
        const trueCount = Number(raw.trueCount ?? 0);
        const chCount = Number(raw.channelCount ?? raw.rowCount ?? 0);
        const strValue = raw.strValue != null ? String(raw.strValue) : null;

        if (defaultKeys.includes(metricId as typeof defaultKeys[number]) && avgNum != null && chCount > 0) {
            numericSums[metricId].sum += avgNum * chCount;
            numericSums[metricId].count += chCount;
            channelCount = Math.max(channelCount, chCount);
        }

        if (metricId === 'success') {
            successCount += trueCount;
            successTotal += chCount;
            channelCount = Math.max(channelCount, chCount);
        }

        if (metricId === 'customer_sentiment' && strValue) {
            const lower = strValue.toLowerCase();
            const cnt = Number(raw.rowCount ?? chCount);
            if (lower === 'positive') positiveCount += cnt;
            else if (lower === 'neutral') neutralCount += cnt;
            else if (lower === 'negative') negativeCount += cnt;
            sentimentTotal += cnt;
            channelCount = Math.max(channelCount, cnt);
        }
    }

    const aggregationCount = channelCount || successTotal || sentimentTotal;
    if (aggregationCount === 0) {
        return empty;
    }

    const numericAverages: Record<string, number> = {};
    for (const key of defaultKeys) {
        const bucket = numericSums[key];
        numericAverages[key] = bucket.count > 0
            ? parseFloat((bucket.sum / bucket.count).toFixed(2))
            : 0;
    }

    return {
        numericAverages,
        aggregationCount,
        successCount,
        positiveCount,
        neutralCount,
        negativeCount,
        usedSql: true,
    };
}

export const DASHBOARD_PAGE_SIZE = 2000;

function appendCdrFilterClauses(
    dialect: string,
    cdrAlias: string,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    realUserId: string,
    clauses: string[],
    replacements: Record<string, unknown>,
): void {
    const c = cdrAlias;
    if (!isAdmin) {
        clauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = String(realUserId);
    } else if (filters.userId) {
        clauses.push(`${c}.${q('userId', dialect)} = :userId`);
        replacements.userId = filters.userId;
    }

    if (filters.projectId != null) {
        clauses.push(`${c}.${q('projectId', dialect)} = :projectId`);
        replacements.projectId = filters.projectId;
    }
    if (filters.operatorNameExact) {
        clauses.push(`${c}.${q('assistantName', dialect)} = :operatorNameExact`);
        replacements.operatorNameExact = filters.operatorNameExact;
    } else if (filters.operatorName) {
        const op = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
        clauses.push(`${c}.${q('assistantName', dialect)} ${op} :operatorName`);
        replacements.operatorName = `%${filters.operatorName}%`;
    }
    if (filters.startDate && filters.endDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} BETWEEN :from AND :to`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    } else if (filters.startDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} >= :from`);
        replacements.from = new Date(`${filters.startDate}T00:00:00`);
    } else if (filters.endDate) {
        clauses.push(`${c}.${q('createdAt', dialect)} <= :to`);
        replacements.to = new Date(`${filters.endDate}T23:59:59`);
    }
}

function successJsonExpr(dialect: string, analyticsAlias: string): string {
    if (dialect === 'postgres') {
        return `(${analyticsAlias}.${q('metrics', dialect)}::jsonb->>'success')`;
    }
    return `JSON_UNQUOTE(JSON_EXTRACT(${analyticsAlias}.${q('metrics', dialect)}, '$.success'))`;
}

function sentimentJsonExpr(dialect: string, analyticsAlias: string): string {
    if (dialect === 'postgres') {
        return `LOWER(COALESCE(
            NULLIF(${analyticsAlias}.${q('sentiment', dialect)}, ''),
            ${analyticsAlias}.${q('metrics', dialect)}::jsonb->>'customer_sentiment'
        ))`;
    }
    return `LOWER(COALESCE(
        NULLIF(${analyticsAlias}.${q('sentiment', dialect)}, ''),
        JSON_UNQUOTE(JSON_EXTRACT(${analyticsAlias}.${q('metrics', dialect)}, '$.customer_sentiment'))
    ))`;
}

/**
 * Resolve AiCdr.channelId values for donut drilldown filters.
 * Uses the same aiCdr date/tenant join as dashboard SQL aggregation so the list
 * matches the donut segments (does NOT filter operator_metric_values.userId —
 * that column can be null/mismatched while CDR ownership is authoritative).
 */
export async function findChannelIdsForDistribution(
    sequelize: Sequelize,
    filters: DashboardCdrFilters,
    isAdmin: boolean,
    realUserId: string,
    opts: { sentiment?: 'positive' | 'neutral' | 'negative'; success?: boolean },
): Promise<string[]> {
    const dialect = sequelize.getDialect();
    const c = 'c';
    const mv = 'mv';
    const a = 'a';
    const replacements: Record<string, unknown> = {};
    const cdrClauses: string[] = ['1=1'];
    appendCdrFilterClauses(dialect, c, filters, isAdmin, realUserId, cdrClauses, replacements);

    let metricClause = '';
    if (opts.sentiment) {
        replacements.sentiment = opts.sentiment;
        metricClause = `
            ${mv}.${q('metricId', dialect)} = 'customer_sentiment'
            AND LOWER(${mv}.${q('strValue', dialect)}) = :sentiment
        `;
    } else if (opts.success !== undefined) {
        // postgres boolean column accepts JS boolean; mysql tinyint needs 0/1
        replacements.successBool = dialect === 'postgres' ? opts.success : (opts.success ? 1 : 0);
        metricClause = `
            ${mv}.${q('metricId', dialect)} = 'success'
            AND ${mv}.${q('boolValue', dialect)} = :successBool
        `;
    } else {
        return [];
    }

    const mvSql = `
        SELECT DISTINCT ${mv}.${q('channelId', dialect)} AS "channelId"
        FROM ${q('operator_metric_values', dialect)} ${mv}
        INNER JOIN ${q('aiCdr', dialect)} ${c}
            ON ${c}.${q('channelId', dialect)} = ${mv}.${q('channelId', dialect)}
        WHERE ${cdrClauses.join(' AND ')}
          AND ${metricClause}
        LIMIT 5000
    `;

    const [mvRows] = await sequelize.query(mvSql, { replacements });
    const fromMv = Array.isArray(mvRows)
        ? mvRows.map(r => String((r as { channelId?: string }).channelId ?? '')).filter(Boolean)
        : [];
    if (fromMv.length) return fromMv;

    // Fallback to aiAnalytics (JSON / sentiment column) — same population as JS dashboard path
    const aaReplacements: Record<string, unknown> = {};
    const aaCdrClauses: string[] = ['1=1'];
    appendCdrFilterClauses(dialect, c, filters, isAdmin, realUserId, aaCdrClauses, aaReplacements);

    let aaPredicate = '';
    if (opts.sentiment) {
        aaReplacements.sentiment = opts.sentiment;
        aaPredicate = `${sentimentJsonExpr(dialect, a)} = :sentiment`;
    } else if (opts.success !== undefined) {
        aaReplacements.successTrue = opts.success ? 'true' : 'false';
        // JSON may store boolean true/false; compare as lowercase string for both dialects
        aaPredicate = `LOWER(${successJsonExpr(dialect, a)}) = :successTrue`;
    }

    const aaSql = `
        SELECT DISTINCT ${a}.${q('channelId', dialect)} AS "channelId"
        FROM ${q('aiAnalytics', dialect)} ${a}
        INNER JOIN ${q('aiCdr', dialect)} ${c}
            ON ${c}.${q('channelId', dialect)} = ${a}.${q('channelId', dialect)}
        WHERE ${aaCdrClauses.join(' AND ')}
          AND ${aaPredicate}
        LIMIT 5000
    `;
    const [aaRows] = await sequelize.query(aaSql, { replacements: aaReplacements });
    if (!Array.isArray(aaRows)) return [];
    return aaRows.map(r => String((r as { channelId?: string }).channelId ?? '')).filter(Boolean);
}
