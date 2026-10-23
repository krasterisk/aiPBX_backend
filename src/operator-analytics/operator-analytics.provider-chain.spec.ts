import { OperatorAnalyticsService } from './operator-analytics.service';
import { AnalyticsProvidersUnavailableError } from './lib/analytics-provider-chain';

function completion(content = '{"ok":true}', model = 'gpt-5-nano') {
    return { model, usage: { total_tokens: 20 }, choices: [{ message: { content }, finish_reason: 'stop' }] };
}

function fixture() {
    const service: any = Object.create(OperatorAnalyticsService.prototype);
    service.logger = { log: jest.fn(), warn: jest.fn() };
    service.analyticsModel = 'gpt-5-nano';
    service.fallbackModel = 'qwen3.5:9b';
    service.deepSeekModel = 'deepseek-v4-pro';
    const primary = jest.fn(), nano = jest.fn(), qwen = jest.fn();
    service.deepSeekClient = { chat: { completions: { create: primary } } };
    service.openAiClient = { chat: { completions: { create: nano } } };
    service.ollamaClient = { chat: { completions: { create: qwen } } };
    return { service, primary, nano, qwen };
}

describe('OperatorAnalyticsService provider chain', () => {
    it('streams DeepSeek with disabled thinking/JSON mode and preserves model/usage', async () => {
        const { service, primary, nano, qwen } = fixture();
        primary.mockImplementation(async () => (async function* () {
            yield { model: 'deepseek-v4-pro', choices: [{ delta: { content: '{"ok":' } }] };
            yield { choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }] };
            yield { choices: [], usage: { total_tokens: 25, prompt_cache_hit_tokens: 10 } };
        })());
        const validateContent = jest.fn();
        const answer = await service.chatWithFallback([{ role: 'user', content: 'synthetic' }], { validateContent });
        expect(answer.model).toBe('deepseek-v4-pro');
        expect(answer.usage).toEqual({ total_tokens: 25, prompt_cache_hit_tokens: 10 });
        expect(validateContent).toHaveBeenCalledWith('{"ok":true}');
        expect(primary.mock.calls[0][0]).toMatchObject({
            model: 'deepseek-v4-pro', thinking: { type: 'disabled' }, stream: true,
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
