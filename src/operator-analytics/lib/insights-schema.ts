import { createHash } from 'crypto';
import { z } from 'zod';

export const INSIGHTS_PROMPT_VERSION = '2026-06-18.2';

export type InsightPriority = 'high' | 'medium' | 'low';
export type InsightType = 'strength' | 'gap' | 'trend' | 'outlier' | 'quality';

export interface OperatorInsightEvidence {
    metric?: string;
    value?: number;
    operators?: string[];
    periodLabel?: string;
    channelIds?: string[];
}

export interface OperatorInsight {
    priority: InsightPriority;
    type: InsightType;
    title: string;
    observation: string;
    recommendation: string;
    evidence: OperatorInsightEvidence;
}

export interface OperatorInsightsResponse {
    insights: OperatorInsight[];
    generatedAt: string;
    promptVersion: string;
    sampleSize: number;
    lowConfidence: boolean;
    factsDigest?: string;
}

const PRIORITY_ALIASES: Record<string, InsightPriority> = {
    high: 'high',
    medium: 'medium',
    low: 'low',
    h: 'high',
    m: 'medium',
    l: 'low',
    высокий: 'high',
    высокая: 'high',
    средний: 'medium',
    средняя: 'medium',
    низкий: 'low',
    низкая: 'low',
};

const TYPE_ALIASES: Record<string, InsightType> = {
    strength: 'strength',
    gap: 'gap',
    trend: 'trend',
    outlier: 'outlier',
    quality: 'quality',
    сильная: 'strength',
    сильная_сторона: 'strength',
    пробел: 'gap',
    тренд: 'trend',
    выброс: 'outlier',
    аномалия: 'outlier',
    качество: 'quality',
    'data quality': 'quality',
};

const insightPrioritySchema = z.enum(['high', 'medium', 'low']);
const insightTypeSchema = z.enum(['strength', 'gap', 'trend', 'outlier', 'quality']);

const evidenceSchema = z.object({
    metric: z.string().optional(),
    value: z.number().nullish(),
    operators: z.array(z.string()).optional(),
    periodLabel: z.string().optional(),
    channelIds: z.array(z.string()).max(5).optional(),
});

const operatorInsightSchema = z.object({
    priority: insightPrioritySchema,
    type: insightTypeSchema,
    title: z.string().min(1),
    observation: z.string().min(1),
    recommendation: z.string(),
    evidence: evidenceSchema,
});

const llmInsightsPayloadSchema = z.object({
    insights: z.array(operatorInsightSchema).min(1).max(10),
});

export class InsightsSchemaValidationError extends Error {
    constructor(message: string, public readonly rawContent?: string) {
        super(message);
        this.name = 'InsightsSchemaValidationError';
    }
}

export function buildInsightsJsonSchema() {
    const evidenceSchemaStrict = {
        type: 'object',
        properties: {
            metric: { type: 'string' },
            value: { type: ['number', 'null'] },
            operators: { type: 'array', items: { type: 'string' } },
            periodLabel: { type: 'string' },
        },
        required: ['metric', 'value', 'operators', 'periodLabel'],
        additionalProperties: false,
    };

    const insightItem = {
        type: 'object',
        properties: {
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            type: { type: 'string', enum: ['strength', 'gap', 'trend', 'outlier', 'quality'] },
            title: { type: 'string' },
            observation: { type: 'string' },
            recommendation: { type: 'string' },
            evidence: evidenceSchemaStrict,
        },
        required: ['priority', 'type', 'title', 'observation', 'recommendation', 'evidence'],
        additionalProperties: false,
    };

    return {
        type: 'object',
        properties: {
            insights: {
                type: 'array',
                items: insightItem,
                minItems: 1,
                maxItems: 10,
            },
        },
        required: ['insights'],
        additionalProperties: false,
    };
}

function normalizePriority(raw: unknown): InsightPriority {
    if (typeof raw !== 'string') return 'medium';
    const key = raw.trim().toLowerCase();
    return PRIORITY_ALIASES[key] ?? 'medium';
}

function normalizeInsightType(raw: unknown): InsightType {
    if (typeof raw !== 'string') return 'quality';
    const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
    return TYPE_ALIASES[key] ?? 'quality';
}

function sanitizeEvidence(raw: unknown): OperatorInsightEvidence {
    if (!raw || typeof raw !== 'object') return {};

    const e = raw as Record<string, unknown>;
    const evidence: OperatorInsightEvidence = {};

    if (typeof e.metric === 'string' && e.metric.trim()) {
        evidence.metric = e.metric.trim();
    }
    if (typeof e.value === 'number' && Number.isFinite(e.value)) {
        evidence.value = e.value;
    } else if (typeof e.value === 'string' && e.value.trim()) {
        const n = Number(e.value.replace(',', '.'));
        if (Number.isFinite(n)) evidence.value = n;
    }
    if (Array.isArray(e.operators)) {
        const ops = e.operators.filter((o): o is string => typeof o === 'string' && o.trim().length > 0);
        if (ops.length) evidence.operators = ops;
    }
    if (typeof e.periodLabel === 'string' && e.periodLabel.trim()) {
        evidence.periodLabel = e.periodLabel.trim();
    }
    if (Array.isArray(e.channelIds)) {
        const ids = e.channelIds
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
            .slice(0, 5);
        if (ids.length) evidence.channelIds = ids;
    }

    return evidence;
}

function normalizeInsightItem(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') return raw;
    const item = raw as Record<string, unknown>;
    return {
        ...item,
        priority: normalizePriority(item.priority),
        type: normalizeInsightType(item.type),
        title: typeof item.title === 'string' ? item.title : String(item.title ?? ''),
        observation: typeof item.observation === 'string' ? item.observation : String(item.observation ?? ''),
        recommendation: typeof item.recommendation === 'string' ? item.recommendation : String(item.recommendation ?? ''),
        evidence: item.evidence,
    };
}

function normalizeInsightsPayload(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object') return raw;
    const payload = raw as { insights?: unknown };
    if (!Array.isArray(payload.insights)) return raw;
    return {
        ...payload,
        insights: payload.insights.map(normalizeInsightItem),
    };
}

function wrapLegacyStringInsights(insights: string[]): OperatorInsight[] {
    return insights.map(text => ({
        priority: 'low' as const,
        type: 'quality' as const,
        title: text.slice(0, 80),
        observation: text,
        recommendation: '',
        evidence: {},
    }));
}

export function parseAndValidateInsightsResponse(raw: unknown): OperatorInsight[] {
    if (raw && typeof raw === 'object' && Array.isArray((raw as { insights?: unknown }).insights)) {
        const insights = (raw as { insights: unknown[] }).insights;
        if (insights.length > 0 && typeof insights[0] === 'string') {
            return wrapLegacyStringInsights(insights as string[]);
        }
    }

    const normalized = normalizeInsightsPayload(raw);
    const result = llmInsightsPayloadSchema.safeParse(normalized);
    if (!result.success) {
        throw new InsightsSchemaValidationError(
            result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
            JSON.stringify(raw),
        );
    }

    return result.data.insights.map(insight => ({
        ...insight,
        evidence: sanitizeEvidence(insight.evidence),
    }));
}

export function buildOperatorInsightsResponse(
    insights: OperatorInsight[],
    sampleSize: number,
    lowConfidence: boolean,
    factsDigest?: string,
): OperatorInsightsResponse {
    return {
        insights,
        generatedAt: new Date().toISOString(),
        promptVersion: INSIGHTS_PROMPT_VERSION,
        sampleSize,
        lowConfidence,
        ...(factsDigest ? { factsDigest } : {}),
    };
}

export function computeFactsDigest(facts: unknown): string {
    return createHash('sha256')
        .update(JSON.stringify(facts))
        .digest('hex')
        .slice(0, 8);
}
