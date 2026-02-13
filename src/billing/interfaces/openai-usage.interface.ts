export interface OpenAiUsage {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_token_details?: {
        text_tokens: number;
        audio_tokens: number;
        image_tokens?: number;
        cached_tokens?: number;
        cached_tokens_details?: {
            text_tokens: number;
            audio_tokens: number;
            image_tokens?: number;
        };
    };
    output_token_details?: {
        text_tokens: number;
        audio_tokens: number;
    };
}

export interface BillingResult {
    audioTokens: number;
    textTokens: number;
    analyticTokens: number;
    audioCost: number;
    textCost: number;
    analyticCost: number;
    totalCost: number;
}
