jest.mock('glob', () => ({ globSync: () => [] }));
import { OperatorAnalyticsService } from './operator-analytics.service';
import { AnalyticsProvidersUnavailableError, resolveInsightsDeepSeekModel } from './lib/analytics-provider-chain';

function completion(content = '{"ok":true}', model = 'gpt-5-nano') {
    return { model, usage: { total_tokens: 20 }, choices: [{ message: { content }, finish_reason: 'stop' }] };
}

function fixture() {
    const service: any = Object.create(OperatorAnalyticsService.prototype);
    service.logger = { log: jest.fn(), warn: jest.fn() };
    service.analyticsModel = 'gpt-5-nano';
    service.fallbackModel = 'qwen3.5:9b';
    service.deepSeekModel = 'deepseek-flash';
    service.insightsDeepSeekModel = resolveInsightsDeepSeekModel('deepseek-v4-pro');
    const primary = jest.fn(), nano = jest.fn(), qwen = jest.fn();
    service.deepSeekClient = { chat: { completions: { create: primary } } };
    service.openAiClient = { chat: { completions: { create: nano } } };
    service.ollamaClient = { chat: { completions: { create: qwen } } };
    return { service, primary, nano, qwen };
}

describe('OperatorAnalyticsService provider chain', () => {
    it('uses the insight env default and trims an explicit model value', () => {
        expect(resolveInsightsDeepSeekModel('')).toBe('deepseek-v4-pro');
        expect(resolveInsightsDeepSeekModel('   ')).toBe('deepseek-v4-pro');
        expect(resolveInsightsDeepSeekModel(' deepseek-v4-pro ')).toBe('deepseek-v4-pro');
        expect(resolveInsightsDeepSeekModel(' deepseek-flash ')).toBe('deepseek-flash');
    });

    it('reads the dedicated environment parameter', () => {
        const original = process.env.ANALYTICS_INSIGHTS_DEEPSEEK_MODEL;
        try {
            process.env.ANALYTICS_INSIGHTS_DEEPSEEK_MODEL = ' configured-insight-model ';
            expect(resolveInsightsDeepSeekModel()).toBe('configured-insight-model');
        } finally {
            if (original == null) delete process.env.ANALYTICS_INSIGHTS_DEEPSEEK_MODEL;
            else process.env.ANALYTICS_INSIGHTS_DEEPSEEK_MODEL = original;
        }
    });

    it('routes insights to Pro and the next analysis to Flash without changing shared client configuration', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockImplementation(async (params: any) => (async function* () {
            yield { model: params.model, choices: [{ delta: { content: '{"ok":true}' }, finish_reason: 'stop' }] };
        })());
        expect((await service.chatWithFallback([], { purpose: 'insights' })).model).toBe('deepseek-v4-pro');
        expect((await service.chatWithFallback([])).model).toBe('deepseek-flash');
        expect(primary.mock.calls.map(call => call[0].model)).toEqual(['deepseek-v4-pro', 'deepseek-flash']);
        for (const [params] of primary.mock.calls) expect(params.thinking).toEqual({ type: 'disabled' });
        expect(nano).not.toHaveBeenCalled(); expect(qwen).not.toHaveBeenCalled();
    });

    it('retains the configured reserve chain when the insight-specific model fails', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockRejectedValue({ status: 404 });
        nano.mockResolvedValue(completion());
        expect((await service.chatWithFallback([], { purpose: 'insights' })).model).toBe('gpt-5-nano');
        expect(primary.mock.calls[0][0].model).toBe('deepseek-v4-pro');
        expect(primary).toHaveBeenCalledTimes(1); expect(qwen).not.toHaveBeenCalled();
    });

    it('streams DeepSeek with disabled thinking/JSON mode and preserves model/usage', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockImplementation(async () => (async function* () {
            yield { model: 'deepseek-flash', choices: [{ delta: { content: '{"ok":' } }] };
            yield { choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }] };
            yield { choices: [], usage: { total_tokens: 25, prompt_cache_hit_tokens: 10 } };
        })());
        const validateContent = jest.fn();
        const answer = await service.chatWithFallback([{ role: 'user', content: 'synthetic' }], { validateContent });
        expect(answer.model).toBe('deepseek-flash');
        expect(answer.usage).toEqual({ total_tokens: 25, prompt_cache_hit_tokens: 10 });
        expect(validateContent).toHaveBeenCalledWith('{"ok":true}');
        expect(primary.mock.calls[0][0]).toMatchObject({
            model: 'deepseek-flash', thinking: { type: 'disabled' }, stream: true,
            stream_options: { include_usage: true }, response_format: { type: 'json_object' }, max_tokens: 8192,
        });
        expect(primary.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(nano).not.toHaveBeenCalled();
        expect(qwen).not.toHaveBeenCalled();
    });

    it('advances from three stalled streams to nano, without extra schema-repair requests', async () => {
        jest.useFakeTimers();
        try {
            const { service, primary, nano, qwen } = fixture();
            primary.mockImplementation(async () => (async function* () { await new Promise(() => {}); })());
            nano.mockResolvedValue(completion());
            const work = service.chatWithFallback([{ role: 'user', content: 'synthetic' }]);
            await jest.advanceTimersByTimeAsync(65000);
            expect((await work).model).toBe('gpt-5-nano');
            expect(primary).toHaveBeenCalledTimes(3);
            expect(nano).toHaveBeenCalledTimes(1);
            expect(qwen).not.toHaveBeenCalled();
            for (const args of primary.mock.calls) expect(args[1].signal.aborted).toBe(true);
        } finally { jest.useRealTimers(); }
    });

    it('rejects invalid nano JSON and accepts the local reserve with its actual model', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockRejectedValue({ status: 402 });
        nano.mockResolvedValue(completion('truncated JSON'));
        qwen.mockResolvedValue(completion('{"ok":true}', 'qwen3.5:9b'));
        expect((await service.chatWithFallback([])).model).toBe('qwen3.5:9b');
        expect(primary).toHaveBeenCalledTimes(1);
        expect(nano).toHaveBeenCalledTimes(1);
        expect(qwen).toHaveBeenCalledTimes(1);
    });

    it('fails visibly after the last provider and does not log private provider errors', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockRejectedValue({ status: 401, message: 'private credential' });
        nano.mockRejectedValue(new Error('private prompt'));
        qwen.mockRejectedValue(new Error('private transcript'));
        await expect(service.chatWithFallback([])).rejects.toBeInstanceOf(AnalyticsProvidersUnavailableError);
        expect(JSON.stringify(service.logger.warn.mock.calls)).not.toMatch(/private/);
    });

    it('retains OpenAI-first behavior when the DeepSeek client is disabled', async () => {
        const { service, primary, nano, qwen } = fixture();
        service.deepSeekClient = null;
        nano.mockResolvedValue(completion());
        expect((await service.chatWithFallback([])).model).toBe('gpt-5-nano');
        expect(primary).not.toHaveBeenCalled();
        expect(qwen).not.toHaveBeenCalled();
    });

    it('uses the complete native topic validator before accepting a provider response', async () => {
        const { service, primary, nano, qwen } = fixture();
        const body = (tags: string[]) => JSON.stringify({ assessments: {}, greeting_quality: 100,
            customer_sentiment: 'Positive', csat: 5, summary: 'Synthetic', success: true,
            analysis_confidence: 0.9, insufficient_content: false, topic_tag_ids: tags });
        const project = { singleTopic: true, visibleDefaultMetrics: ['greeting_quality'],
            callTaxonomy: [{ id: 'a', name: 'A', aliases: [] }, { id: 'b', name: 'B', aliases: [] }] };
        primary.mockRejectedValue({ status: 402 });
        nano.mockResolvedValue(completion(body(['a', 'b'])));
        qwen.mockResolvedValue(completion(body(['a']), 'qwen3.5:9b'));
        const result = await service.analyzeTranscription('Synthetic dialogue', undefined, project, undefined, { llmDiarize: false });
        expect(result.topicTagIds).toEqual(['a']);
        expect(result.modelName).toBe('qwen3.5:9b');
        expect(primary).toHaveBeenCalledTimes(1);
        expect(nano).toHaveBeenCalledTimes(1);
        expect(qwen).toHaveBeenCalledTimes(1);
    });
});
