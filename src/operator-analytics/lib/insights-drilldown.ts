import { Op, WhereOptions } from 'sequelize';
import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import type { OperatorInsight, OperatorInsightEvidence } from './insights-schema';
import { buildDashboardCdrWhere } from './dashboard-aggregation';

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
        query: {
            userId?: string;
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
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
    ) as WhereOptions<AiCdr>;

    return Promise.all(insights.map(async (insight) => {
        const channelIds = await findExemplarChannelIds(
            baseWhere,
            insight.evidence,
            insight.type,
            deps,
        );
        if (!channelIds.length) return insight;
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
    },
): Promise<string[]> {
    const where: WhereOptions<AiCdr> = { ...baseWhere };
    const operator = evidence.operators?.[0];
    if (operator) {
        Object.assign(where, { assistantName: deps.likeOp(`%${operator}%`) });
    }

    const rows = await deps.aiCdrRepository.findAll({
        where,
        attributes: ['channelId', 'analytics'],
        limit: 120,
        order: [['createdAt', 'DESC']],
    });

    let ordered = rows;
    if (evidence.metric) {
        const metricKey = evidence.metric;
        const lowIsBad = insightType === 'gap' || insightType === 'outlier' || insightType === 'quality';
        ordered = [...rows].sort((a, b) => {
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
