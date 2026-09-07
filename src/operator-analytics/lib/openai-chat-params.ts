/**
 * Chat Completions params for operator analytics.
 *
 * GPT-5 / o-series reasoning models reject temperature !== 1 and `max_tokens`.
 * Classic chat models (gpt-4o-mini, gpt-5-chat-*) still take temperature=0.
 */

export type OpenAiAnalyticsChatParams = {
    model: string;
    messages: unknown[];
    temperature?: number;
    reasoning_effort?: string;
    max_tokens?: number;
    max_completion_tokens?: number;
    response_format?: Record<string, unknown>;
};

export type BuildOpenAiAnalyticsChatParamsInput = {
    model: string;
    messages: unknown[];
    temperature?: number;
    jsonSchema?: Record<string, unknown>;
    schemaName?: string;
    jsonObject?: boolean;
    maxTokens?: number;
    reasoningEffort?: string;
};

export function isOpenAiReasoningModel(model: string): boolean {
    const name = (model || '').toLowerCase().trim();
    if (!name) return false;
    if (name.includes('gpt-5-chat')) return false;
    if (name.startsWith('gpt-5')) return true;
    return /^o[1-9]/.test(name);
}

export function buildOpenAiAnalyticsChatParams(
    input: BuildOpenAiAnalyticsChatParamsInput,
): OpenAiAnalyticsChatParams {
    const reasoning = isOpenAiReasoningModel(input.model);
    const params: OpenAiAnalyticsChatParams = {
        model: input.model,
        messages: input.messages,
    };

    if (reasoning) {
        params.reasoning_effort = input.reasoningEffort || 'low';
        if (input.maxTokens != null) {
            params.max_completion_tokens = input.maxTokens;
        }
    } else {
        if (input.temperature != null) {
            params.temperature = input.temperature;
        }
        if (input.maxTokens != null) {
            params.max_tokens = input.maxTokens;
        }
    }

    if (input.jsonSchema) {
        params.response_format = {
            type: 'json_schema',
            json_schema: {
                name: input.schemaName || 'operator_analysis',
                strict: true,
                schema: input.jsonSchema,
            },
        };
    } else if (input.jsonObject !== false) {
        params.response_format = { type: 'json_object' };
    }

    return params;
}
