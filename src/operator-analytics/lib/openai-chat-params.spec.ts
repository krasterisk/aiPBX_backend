import { buildOpenAiAnalyticsChatParams, isOpenAiReasoningModel } from './openai-chat-params';

describe('isOpenAiReasoningModel', () => {
    it('treats gpt-5-nano / mini / base as reasoning models', () => {
        expect(isOpenAiReasoningModel('gpt-5-nano')).toBe(true);
        expect(isOpenAiReasoningModel('gpt-5-mini')).toBe(true);
        expect(isOpenAiReasoningModel('gpt-5')).toBe(true);
        expect(isOpenAiReasoningModel('gpt-5.1')).toBe(true);
    });

    it('does not treat gpt-5-chat or gpt-4o as reasoning models', () => {
        expect(isOpenAiReasoningModel('gpt-5-chat-latest')).toBe(false);
        expect(isOpenAiReasoningModel('gpt-4o-mini')).toBe(false);
        expect(isOpenAiReasoningModel('gpt-4.1')).toBe(false);
    });

    it('treats o-series models as reasoning models', () => {
        expect(isOpenAiReasoningModel('o3-mini')).toBe(true);
        expect(isOpenAiReasoningModel('o4-mini')).toBe(true);
    });
});

describe('buildOpenAiAnalyticsChatParams', () => {
    const messages = [{ role: 'system', content: 'json' }, { role: 'user', content: 'hi' }];
    const schema = { type: 'object', properties: {}, additionalProperties: false };

    it('omits temperature for gpt-5-nano and sends reasoning_effort', () => {
        const params = buildOpenAiAnalyticsChatParams({
            model: 'gpt-5-nano',
            messages,
            temperature: 0,
            jsonSchema: schema,
            schemaName: 'operator_analysis',
        });

        expect(params).not.toHaveProperty('temperature');
        expect(params.reasoning_effort).toBe('low');
        expect(params.model).toBe('gpt-5-nano');
        expect(params.response_format).toEqual({
            type: 'json_schema',
            json_schema: {
                name: 'operator_analysis',
                strict: true,
                schema,
            },
        });
    });

    it('keeps temperature 0 for gpt-4o-mini and does not send reasoning_effort', () => {
        const params = buildOpenAiAnalyticsChatParams({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0,
            jsonObject: true,
        });

        expect(params.temperature).toBe(0);
        expect(params).not.toHaveProperty('reasoning_effort');
        expect(params.response_format).toEqual({ type: 'json_object' });
    });

    it('uses max_completion_tokens instead of max_tokens for reasoning models', () => {
        const params = buildOpenAiAnalyticsChatParams({
            model: 'gpt-5-nano',
            messages,
            maxTokens: 8192,
        });

        expect(params).not.toHaveProperty('max_tokens');
        expect(params.max_completion_tokens).toBe(8192);
    });

    it('uses max_tokens for classic chat models', () => {
        const params = buildOpenAiAnalyticsChatParams({
            model: 'gpt-4o-mini',
            messages,
            temperature: 0,
            maxTokens: 4096,
        });

        expect(params.max_tokens).toBe(4096);
        expect(params).not.toHaveProperty('max_completion_tokens');
    });

    it('honors an explicit reasoning_effort override', () => {
        const params = buildOpenAiAnalyticsChatParams({
            model: 'gpt-5-nano',
            messages,
            reasoningEffort: 'minimal',
        });

        expect(params.reasoning_effort).toBe('minimal');
        expect(params).not.toHaveProperty('temperature');
    });
});
