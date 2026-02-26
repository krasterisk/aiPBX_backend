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

/** Project-level custom metric definition (with id and enum support) */
export interface MetricDefinition {
    id: string;                     // snake_case identifier
    name: string;                   // Human-readable, e.g. "Попытка апселла"
    type: 'boolean' | 'number' | 'enum' | 'string';
    description: string;            // Instruction for LLM (max 500 chars)
    enumValues?: string[];          // Only when type === 'enum'
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

export type WebhookEvent = 'analysis.completed' | 'analysis.error';

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

export interface TranscriptionResult {
    text: string;
    duration: number; // seconds
}

export interface ITranscriptionProvider {
    transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult>;
}
