/**
 * Metrics structure for live operator call analysis.
 * Aligned with COPC / ICMI call center quality standards.
 */
export interface OperatorMetrics {
    greeting_quality: number;       // 0-100
    script_compliance: number;      // 0-100
    politeness_empathy: number;     // 0-100
    active_listening: number;       // 0-100
    objection_handling: number;     // 0-100
    product_knowledge: number;      // 0-100
    problem_resolution: number;     // 0-100
    speech_clarity_pace: number;    // 0-100
    closing_quality: number;        // 0-100
    customer_sentiment: string;     // "Positive" | "Neutral" | "Negative"
    csat?: number;
    summary: string;
    success: boolean;
}

/** Legacy custom metric definition (used in ad-hoc analysis) */
export interface CustomMetricDef {
    name: string;
    type: 'boolean' | 'number' | 'string';
    description: string;
}

// ─── Dynamic Analytics Types ─────────────────────────────────────

/**
 * Coloring/semantics of a metric value:
 * - positive: higher number / `true` boolean is good (green)
 * - negative: lower number / `false` boolean is good (true/high = red)
 * - neutral:  informational, no good/bad coloring
 */
export type MetricPolarity = 'positive' | 'negative' | 'neutral';

/** Project-level custom metric definition (with id and enum support) */
export interface MetricDefinition {
    id: string;                     // snake_case identifier
    name: string;                   // Human-readable, e.g. "Попытка апселла"
    type: 'boolean' | 'number' | 'enum' | 'string';
    description: string;            // Instruction for LLM (max 500 chars)
    enumValues?: string[];          // Only when type === 'enum'
    min?: number;                   // number scale minimum (default 0)
    max?: number;                   // number scale maximum (default 100)
    unit?: string;                  // optional display suffix, e.g. "/10", "%"
    polarity?: MetricPolarity;      // coloring semantics (see MetricPolarity)
}

/** Snapshot of a custom metric definition stored alongside an analysis result */
export interface StoredMetricMeta {
    name?: string;
    type: 'boolean' | 'number' | 'enum' | 'string';
    min?: number;
    max?: number;
    unit?: string;
    polarity?: MetricPolarity;
    enumValues?: string[];
}

export type DefaultMetricKey =
    | 'greeting_quality' | 'script_compliance' | 'politeness_empathy'
    | 'active_listening' | 'objection_handling' | 'product_knowledge'
    | 'problem_resolution' | 'speech_clarity_pace' | 'closing_quality';

export const ALL_DEFAULT_METRIC_KEYS: DefaultMetricKey[] = [
    'greeting_quality', 'script_compliance', 'politeness_empathy',
    'active_listening', 'objection_handling', 'product_knowledge',
    'problem_resolution', 'speech_clarity_pace', 'closing_quality',
];

export type WidgetType = 'stat-card' | 'bar-chart' | 'line-chart' | 'pie-chart'
    | 'tag-cloud' | 'sparkline' | 'heatmap';

export interface DashboardWidget {
    id: string;
    title: string;
    source: 'default' | 'custom';
    metricId: string;
    widgetType: WidgetType;
    size: 'sm' | 'md' | 'lg';
    position: number;
}

export interface DashboardConfig {
    widgets: DashboardWidget[];
    maxWidgets: number;             // limit = 20
}

export type WebhookEvent = 'analysis.completed' | 'analysis.error' | 'budget.exceeded' | 'anomaly.detected';

// ─── Batch Processing Types ──────────────────────────────────────

export type BatchItemStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface BatchStatus {
    batchId: string;
    userId: string;
    total: number;
    completed: number;
    failed: number;
    items: { id: number; filename: string; status: BatchItemStatus }[];
    startedAt: Date;
    finishedAt?: Date;
}

/** Custom headers sent with webhook requests (e.g. Authorization) */
export type WebhookHeaders = Record<string, string>;

/** Project template preset */
export interface ProjectTemplate {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    customMetricsSchema: MetricDefinition[];
    visibleDefaultMetrics: DefaultMetricKey[];
}

// ─── STT Types ───────────────────────────────────────────────────

export type TranscriptionQualityLevel = 'ok' | 'low' | 'unusable';

export interface TranscriptionResult {
    text: string;
    duration: number; // seconds
    language?: string;
    languageProbability?: number;
    avgLogprob?: number;
    noSpeechProb?: number;
    compressionRatio?: number;
    wordsCount?: number;
    segmentsCount?: number;
}

export interface ITranscriptionProvider {
    transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult>;
}
