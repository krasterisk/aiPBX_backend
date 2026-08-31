import type { OperatorMetrics, StoredMetricMeta } from '../interfaces/operator-metrics.interface';
import type { MetricAssessment } from './analysis-schema';
import type { TranscriptionQualityAssessment } from './assess-transcription-quality';

export interface WebhookTurn {
    speaker: string;
    text: string;
    start?: number;
    end?: number;
}

export interface AnalysisCompletedWebhookInput {
    recordId: number;
    filename: string;
    metrics: OperatorMetrics | Record<string, unknown>;
    customMetrics?: Record<string, unknown> | null;
    transcription?: string | null;
    duration?: number | null;
    operatorName?: string | null;
    clientPhone?: string | null;
    language?: string | null;
    detectedLanguage?: string | null;
    recordUrl?: string | null;
    sttProvider?: string | null;
    quality?: TranscriptionQualityAssessment | {
        quality: string;
        confidence?: number | null;
        reasons?: string[] | null;
    } | null;
    assessments?: Record<string, MetricAssessment> | null;
    customMetricsMeta?: Record<string, StoredMetricMeta> | null;
    topics?: Record<string, unknown> | null;
    analysisConfidence?: number | null;
    insufficientContent?: boolean | null;
    schemaVersion?: number | null;
    promptVersion?: string | null;
    model?: string | null;
    diarizationSource?: string | null;
    customMetricsInvalid?: string[] | null;
    regenerated?: boolean;
    deduplicatedFrom?: number;
}

export interface StoredAnalysisRecord {
    id: number;
    filename: string;
    transcription?: string | null;
    duration?: number | null;
    operatorName?: string | null;
    clientPhone?: string | null;
    language?: string | null;
    detectedLanguage?: string | null;
    recordUrl?: string | null;
    sttProvider?: string | null;
    transcriptionQuality?: string | null;
    transcriptionConfidence?: number | null;
    qualityReasons?: string[] | null;
    schemaVersion?: number | null;
    promptVersion?: string | null;
}

const STORED_INTERNAL_KEYS = new Set([
    'custom_metrics',
    '_assessments',
    '_custom_meta',
    '_model',
    '_topics',
    '_schema_version',
    '_custom_invalid',
    '_diarization',
    '_quality',
]);

function isTurn(value: unknown): value is WebhookTurn {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return typeof row.speaker === 'string' && typeof row.text === 'string';
}

function toTurn(row: WebhookTurn): WebhookTurn {
    const turn: WebhookTurn = { speaker: row.speaker, text: row.text };
    if (typeof row.start === 'number') turn.start = row.start;
    if (typeof row.end === 'number') turn.end = row.end;
    return turn;
}

/** Split stored transcript JSON (diarized turns) or keep plain text. */
export function parseWebhookTranscript(raw: string | null | undefined): {
    transcription: string | null;
    turns: WebhookTurn[] | null;
} {
    if (raw == null) return { transcription: null, turns: null };
    const text = String(raw);
    const trimmed = text.trim();
    if (!trimmed) return { transcription: null, turns: null };

    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(isTurn)) {
                const turns = parsed.map(toTurn);
                return {
                    transcription: turns.map(t => `${t.speaker}: ${t.text}`).join('\n'),
                    turns,
                };
            }
        } catch {
            // treat as plain text
        }
    }

    return { transcription: text, turns: null };
}

function publicMetrics(stored: Record<string, unknown>): Record<string, unknown> {
    const metrics: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(stored)) {
        if (STORED_INTERNAL_KEYS.has(key) || key.startsWith('_')) continue;
        metrics[key] = value;
    }
    return metrics;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asQuality(
    value: Record<string, unknown> | null,
    fallback?: {
        quality?: string | null;
        confidence?: number | null;
        reasons?: string[] | null;
    },
): AnalysisCompletedWebhookInput['quality'] {
    if (value && typeof value.quality === 'string') {
        return {
            quality: value.quality,
            confidence: typeof value.confidence === 'number' ? value.confidence : null,
            reasons: Array.isArray(value.reasons) ? value.reasons.filter((r): r is string => typeof r === 'string') : [],
        };
    }
    if (fallback?.quality) {
        return {
            quality: fallback.quality,
            confidence: fallback.confidence ?? null,
            reasons: fallback.reasons ?? [],
        };
    }
    return null;
}

/**
 * Full `analysis.completed` `data` object sent to the project webhook URL.
 * Existing keys (`recordId`, `filename`, `metrics`, `customMetrics`) stay stable.
 */
export function buildAnalysisCompletedWebhookData(
    input: AnalysisCompletedWebhookInput,
): Record<string, unknown> {
    const parsed = parseWebhookTranscript(input.transcription);
    const data: Record<string, unknown> = {
        recordId: input.recordId,
        filename: input.filename,
        metrics: input.metrics ?? {},
        customMetrics: input.customMetrics ?? null,
        transcription: parsed.transcription,
        turns: parsed.turns,
        duration: input.duration ?? null,
        operatorName: input.operatorName ?? null,
        clientPhone: input.clientPhone ?? null,
        language: input.language ?? null,
        detectedLanguage: input.detectedLanguage ?? null,
        recordUrl: input.recordUrl ?? null,
        sttProvider: input.sttProvider ?? null,
        quality: input.quality ?? null,
        assessments: input.assessments ?? null,
        customMetricsMeta: input.customMetricsMeta ?? null,
        topics: input.topics ?? null,
        analysisConfidence: input.analysisConfidence ?? null,
        insufficientContent: input.insufficientContent ?? null,
        schemaVersion: input.schemaVersion ?? null,
        promptVersion: input.promptVersion ?? null,
        model: input.model ?? null,
        diarizationSource: input.diarizationSource ?? null,
        customMetricsInvalid: input.customMetricsInvalid?.length
            ? input.customMetricsInvalid
            : null,
    };

    if (input.regenerated) data.regenerated = true;
    if (input.deduplicatedFrom != null) data.deduplicatedFrom = input.deduplicatedFrom;

    return data;
}

/** Rebuild the same webhook `data` from a persisted record + stored metrics JSON. */
export function buildAnalysisCompletedWebhookDataFromStored(opts: {
    record: StoredAnalysisRecord;
    storedMetrics?: Record<string, unknown> | null;
    regenerated?: boolean;
    deduplicatedFrom?: number;
}): Record<string, unknown> {
    const stored = opts.storedMetrics ?? {};
    const customFromStored = asRecord(stored.custom_metrics);
    const assessments = asRecord(stored._assessments) as Record<string, MetricAssessment> | null;
    const customMeta = asRecord(stored._custom_meta) as Record<string, StoredMetricMeta> | null;
    const topics = asRecord(stored._topics);
    const qualityStored = asRecord(stored._quality);
    const modelBlock = asRecord(stored._model);
    const diarization = asRecord(stored._diarization);
    const invalid = Array.isArray(stored._custom_invalid)
        ? (stored._custom_invalid as unknown[]).filter((v): v is string => typeof v === 'string')
        : null;

    const quality = asQuality(qualityStored, {
        quality: opts.record.transcriptionQuality,
        confidence: opts.record.transcriptionConfidence,
        reasons: opts.record.qualityReasons,
    });

    return buildAnalysisCompletedWebhookData({
        recordId: opts.record.id,
        filename: opts.record.filename,
        metrics: publicMetrics(stored),
        customMetrics: customFromStored,
        transcription: opts.record.transcription,
        duration: opts.record.duration,
        operatorName: opts.record.operatorName,
        clientPhone: opts.record.clientPhone,
        language: opts.record.language,
        detectedLanguage: opts.record.detectedLanguage,
        recordUrl: opts.record.recordUrl,
        sttProvider: opts.record.sttProvider,
        quality,
        assessments,
        customMetricsMeta: customMeta,
        topics,
        schemaVersion: (stored._schema_version as number | undefined) ?? opts.record.schemaVersion ?? null,
        promptVersion: (typeof modelBlock?.promptVersion === 'string'
            ? modelBlock.promptVersion
            : null) ?? opts.record.promptVersion ?? null,
        model: typeof modelBlock?.name === 'string' ? modelBlock.name : null,
        diarizationSource: typeof diarization?.source === 'string' ? diarization.source : null,
        customMetricsInvalid: invalid,
        regenerated: opts.regenerated,
        deduplicatedFrom: opts.deduplicatedFrom,
    });
}
