import { Op, Sequelize, WhereOptions } from 'sequelize';
import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import type { OperatorInsight, OperatorInsightEvidence } from './insights-schema';
import { buildDashboardCdrWhere, DashboardCdrFilters } from './dashboard-aggregation';

const EXEMPLAR_LIMIT = 5;

function readMetricValue(record: AiCdr, metricKey: string): number | null {
    const metrics = record.analytics?.metrics as Record<string, unknown> | undefined;
    if (!metrics) return null;
    const nested = metrics.metrics as Record<string, unknown> | undefined;
    const raw = nested?.[metricKey] ?? metrics[metricKey];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return null;
}

export async function enrichInsightsWithChannelIds(
    insights: OperatorInsight[],
    deps: {
        aiCdrRepository: { findAll: (opts: object) => Promise<AiCdr[]> };
        database?: Sequelize;
        qualityPreview?: boolean;
        query: DashboardCdrFilters & {
            userId?: string;
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            operatorId?: string;
            projectId?: number;
            withoutProject?: boolean;
        };
        isAdmin: boolean;
        realUserId: string | null;
        likeOp: (value: string) => Record<string, string>;
    },
): Promise<OperatorInsight[]> {
    if (!insights.length) return insights;

    const baseWhere = buildDashboardCdrWhere(
        deps.query,
        deps.isAdmin,
        deps.realUserId ?? '',
        deps.likeOp,
        deps.database,
        deps.qualityPreview,
    ) as WhereOptions<AiCdr>;

    return Promise.all(insights.map(async (insight) => {
        const channelIds = await findExemplarChannelIds(
            baseWhere,
            insight.evidence,
            insight.type,
            deps,
        );
        // Never retain model-supplied IDs without checking the authorized selection.
        return {
            ...insight,
            evidence: {
                ...insight.evidence,
                channelIds,
            },
        };
    }));
}

async function findExemplarChannelIds(
    baseWhere: WhereOptions<AiCdr>,
    evidence: OperatorInsightEvidence,
    insightType: OperatorInsight['type'],
    deps: {
        aiCdrRepository: { findAll: (opts: object) => Promise<AiCdr[]> };
        likeOp: (value: string) => Record<string, string>;
        qualityPreview?: boolean;
    },
): Promise<string[]> {
    const where: WhereOptions<AiCdr> = { ...baseWhere };
    const operator = evidence.operators?.[0];
    if (operator) {
        (where as any)[Op.and] = [...((where as any)[Op.and] || []), { assistantName: deps.likeOp(`%${operator}%`) }];
    }

    // analytics lives on aiAnalytics (HasOne), not as a column on aiCdr
    const rows = await deps.aiCdrRepository.findAll({
        where,
        attributes: ['channelId'],
        include: [{
            association: deps.qualityPreview ? 'previewAnalytics' : 'analytics',
            attributes: ['metrics'],
            required: false,
        }],
        limit: 120,
        order: [['createdAt', 'DESC']],
    });

    const normalized = deps.qualityPreview ? rows.map(row => ({ channelId: row.channelId, analytics: row.previewAnalytics } as AiCdr)) : rows;
    let ordered = normalized;
    if (evidence.metric) {
        const metricKey = evidence.metric;
        const lowIsBad = insightType === 'gap' || insightType === 'outlier' || insightType === 'quality';
        ordered = [...normalized].sort((a, b) => {
            const av = readMetricValue(a, metricKey) ?? (lowIsBad ? 999 : -1);
            const bv = readMetricValue(b, metricKey) ?? (lowIsBad ? 999 : -1);
            return lowIsBad ? av - bv : bv - av;
        });
    }

    const ids: string[] = [];
    for (const row of ordered) {
        if (!row.channelId) continue;
        if (ids.includes(row.channelId)) continue;
        ids.push(row.channelId);
        if (ids.length >= EXEMPLAR_LIMIT) break;
    }
    return ids;
}
