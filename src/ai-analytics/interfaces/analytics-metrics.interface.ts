/**
 * Строго типизированная структура метрик, возвращаемых OpenAI при анализе звонка.
 * Соответствует промпту в analyzeCall().
 */
export interface AccuracyAndEfficiency {
    intent_recognition_rate: number;   // 0-100
    entity_extraction_rate: number;    // 0-100
    dialog_completion_rate: number;    // 0 или 1
    context_retention_score: number;   // 0-100
    average_turns: number;             // int
}

export interface SpeechAndInteractionQuality {
    wer_estimated: number;             // 0-100
    response_latency_score: number;    // 0-100
    mos: number;                       // 1-5
    self_recovery_rate: number;        // 0 или 1
}

export interface BusinessImpact {
    escalation_rate: number;           // 0 или 1
    automation_rate: number;           // 0 или 1
    cost_savings_estimated: number;    // float
}

export interface UserSatisfaction {
    csat: number;                      // 1-5
    sentiment: string;                 // "Positive" | "Neutral" | "Negative"
    frustration_detected: boolean;
    bail_out_rate: boolean;
}

export interface ScenarioAnalysis {
    top_fallback_intents: string[];
    escalation_reason: string;
    success: boolean;
    summary: string;
}

export interface AnalyticsMetrics {
    accuracy_and_efficiency: AccuracyAndEfficiency;
    speech_and_interaction_quality: SpeechAndInteractionQuality;
    business_impact: BusinessImpact;
    user_satisfaction: UserSatisfaction;
    scenario_analysis: ScenarioAnalysis;
}
