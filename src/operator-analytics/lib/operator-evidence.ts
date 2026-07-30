import {
    ALL_DEFAULT_METRIC_KEYS,
    StoredMetricMeta,
} from '../interfaces/operator-metrics.interface';

export const EVIDENCE_PER_METRIC = 5;
export const DEFAULT_EVIDENCE_MAX_CALLS = 300;

const NUMERIC_DEFAULT_KEYS = ALL_DEFAULT_METRIC_KEYS;
const SUMMARY_KEYS = ['success', 'customer_sentiment', 'csat'] as const;

export function normalizeQuote(s: string): string {
    return s.replace(/[«»"'`]/g, '').trim().toLowerCase();
}

export function readAssessment(
    metrics: {
        _assessments?: Record<string, { rationale?: string; quote?: string }>;
        _evidence?: Record<string, string>;
    },
    key: string,
): { rationale?: string; quote?: string } | undefined {
    const a = metrics._assessments?.[key];
    if (a && (a.rationale || a.quote)) {
        let quote = a.quote;
        if (quote && a.rationale && normalizeQuote(a.rationale).includes(normalizeQuote(quote))) {
            quote = undefined;
        }
        return { rationale: a.rationale, quote };
    }
    const legacy = metrics._evidence?.[key];
    return legacy ? { quote: legacy } : undefined;
}

export interface OperatorEvidenceItem {
    channelId: string;
    createdAt: string;
    value: number | boolean | string | null;
    rationale?: string;
    quote?: string;
}

export interface OperatorEvidenceMetric {
    metricId: string;
    origin: 'default' | 'custom' | 'summary';
    label?: string;
    average: number | null;
    sampleSize: number;
    evidence: OperatorEvidenceItem[];
}

export interface OperatorEvidenceResponse {
    operatorName: string;
    callsCount: number;
    scoredCalls: number;
    averageScore: number;
    sampleCapped: boolean;
    metrics: OperatorEvidenceMetric[];
}

export interface BuildOperatorEvidenceOptions {
    operatorName: string;
    order?: 'worst' | 'best';
    customMetricIds?: string[];
    sampleCapped?: boolean;
}

type EvidenceRecord = {
    channelId?: string;
    createdAt?: Date | string;
    analytics?: { metrics?: Record<string, unknown> };
};

function readMetricValue(
    metrics: Record<string, unknown>,
    key: string,
): number | boolean | string | null {
    const nested = metrics.metrics as Record<string, unknown> | undefined;
    const raw = nested?.[key] ?? metrics[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw;
    return null;
}

function sortValueForMetric(value: number | boolean | string | null): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === true) return 1;
    if (value === false) return 0;
    return 0;
}

function classifyOrigin(
    key: string,
    customMetricIds: Set<string>,
): 'default' | 'custom' | 'summary' {
    if (customMetricIds.has(key)) return 'custom';
    if ((NUMERIC_DEFAULT_KEYS as readonly string[]).includes(key)) return 'default';
    if ((SUMMARY_KEYS as readonly string[]).includes(key)) return 'summary';
    return 'summary';
}

function collectMetricKeys(metrics: Record<string, unknown>): Set<string> {
    const keys = new Set<string>();
    const assessments = metrics._assessments as Record<string, unknown> | undefined;
    if (assessments) {
        Object.keys(assessments).forEach(k => keys.add(k));
    }
    const legacy = metrics._evidence as Record<string, string> | undefined;
    if (legacy) {
        Object.keys(legacy).forEach(k => keys.add(k));
    }
    return keys;
}

export function buildOperatorEvidence(
    records: EvidenceRecord[],
    opts: BuildOperatorEvidenceOptions,
): OperatorEvidenceResponse {
    const operatorName = opts.operatorName;
    const order = opts.order ?? 'worst';
    const customMetricIds = new Set(opts.customMetricIds ?? []);
    const lowFirst = order === 'worst';

    if (!records.length) {
        return {
            operatorName,
            callsCount: 0,
            scoredCalls: 0,
            averageScore: 0,
            sampleCapped: opts.sampleCapped ?? false,
            metrics: [],
        };
    }

    type Bucket = {
        sum: number;
        sampleSize: number;
        candidates: Array<OperatorEvidenceItem & { sortValue: number }>;
        label?: string;
    };

    const buckets = new Map<string, Bucket>();
    let scoredCalls = 0;
    const scoreSums: Record<string, number> = {};
    NUMERIC_DEFAULT_KEYS.forEach(k => { scoreSums[k] = 0; });
    let scoreCount = 0;

    for (const record of records) {
        const metrics = record.analytics?.metrics as Record<string, unknown> | undefined;
        if (!metrics) continue;

        scoredCalls++;
        NUMERIC_DEFAULT_KEYS.forEach(k => {
            const v = readMetricValue(metrics, k);
            if (typeof v === 'number') scoreSums[k] += v;
        });
        scoreCount++;

        const customMeta = metrics._custom_meta as Record<string, StoredMetricMeta> | undefined;
        const keys = collectMetricKeys(metrics);

        for (const key of keys) {
            const assessment = readAssessment(metrics as Parameters<typeof readAssessment>[0], key);
            if (!assessment?.rationale && !assessment?.quote) continue;

            const value = readMetricValue(metrics, key);
            if (!buckets.has(key)) {
                buckets.set(key, { sum: 0, sampleSize: 0, candidates: [] });
            }
            const bucket = buckets.get(key)!;

            if (typeof value === 'number' && Number.isFinite(value)) {
                bucket.sum += value;
                bucket.sampleSize++;
            } else if (value !== null) {
                bucket.sampleSize++;
            }

            if (customMeta?.[key]?.name) {
                bucket.label = customMeta[key].name;
            }

            bucket.candidates.push({
                channelId: String(record.channelId ?? ''),
                createdAt: record.createdAt instanceof Date
                    ? record.createdAt.toISOString()
                    : String(record.createdAt ?? ''),
                value,
                rationale: assessment.rationale,
                quote: assessment.quote,
                sortValue: sortValueForMetric(value),
            });
        }
    }

    const denom = scoreCount || 1;
    const averageScore = parseFloat(
        (NUMERIC_DEFAULT_KEYS.reduce((s, k) => s + (scoreSums[k] / denom), 0) / NUMERIC_DEFAULT_KEYS.length).toFixed(2),
    );

    const metrics: OperatorEvidenceMetric[] = [];
    for (const [metricId, bucket] of buckets.entries()) {
        bucket.candidates.sort((a, b) => (lowFirst ? a.sortValue - b.sortValue : b.sortValue - a.sortValue));

        const evidence: OperatorEvidenceItem[] = bucket.candidates
            .slice(0, EVIDENCE_PER_METRIC)
            .map(({ sortValue: _sortValue, ...item }) => item);

        if (evidence.length === 0) continue;

        const hasNumeric = bucket.candidates.some(c => typeof c.value === 'number');
        const avgDenom = bucket.sampleSize || 1;
        metrics.push({
            metricId,
            origin: classifyOrigin(metricId, customMetricIds),
            label: bucket.label,
            average: bucket.sampleSize > 0 && hasNumeric
                ? parseFloat((bucket.sum / avgDenom).toFixed(2))
                : null,
            sampleSize: bucket.sampleSize,
            evidence,
        });
    }

    metrics.sort((a, b) => a.metricId.localeCompare(b.metricId));

    return {
        operatorName,
        callsCount: records.length,
        scoredCalls,
        averageScore,
        sampleCapped: opts.sampleCapped ?? false,
        metrics,
    };
}

export function resolveEvidenceMaxCalls(clientLimit?: number): number {
    const envRaw = process.env.OPERATOR_EVIDENCE_MAX_CALLS;
    let cap = envRaw ? Number(envRaw) : DEFAULT_EVIDENCE_MAX_CALLS;
    if (!Number.isFinite(cap) || cap < 1) cap = DEFAULT_EVIDENCE_MAX_CALLS;
    cap = Math.min(Math.max(Math.floor(cap), 1), 1000);

    if (clientLimit != null) {
        const client = Number(clientLimit);
        if (Number.isFinite(client) && client >= 1) {
            cap = Math.min(cap, Math.floor(client));
        }
    }
    return cap;
}
