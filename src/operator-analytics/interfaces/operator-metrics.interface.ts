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
    summary: string;
    success: boolean;
}

export interface CustomMetricDef {
    name: string;
    type: 'boolean' | 'number' | 'string';
    description: string;
}

export interface TranscriptionResult {
    text: string;
    duration: number; // seconds
}

export interface ITranscriptionProvider {
    transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult>;
}
