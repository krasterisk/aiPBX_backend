import {
    AnalyticsProvider, AnalyticsProvidersUnavailableError, AnalyticsStreamTimeoutError,
    readAnalyticsStream, requestAnalyticsOllama, runAnalyticsProviderChain,
} from './analytics-provider-chain';

const ok = (model: string) => ({ content: '{"ok":true}', model, finishReason: 'stop', usage: { total_tokens: 10 } });
const provider = (id: AnalyticsProvider['id'], call: jest.Mock): AnalyticsProvider => ({ id, model: id, call });

describe('analytics provider failover', () => {
    it('returns primary usage and never invokes reserves after success', async () => {
        const primary = jest.fn().mockResolvedValue(ok('deepseek-v4-pro'));
        const reserve = jest.fn();
        const result = await runAnalyticsProviderChain([provider('deepseek', primary), provider('openai', reserve)]);
        expect(result).toEqual(ok('deepseek-v4-pro'));
        expect(primary).toHaveBeenCalledTimes(1);
        expect(reserve).not.toHaveBeenCalled();
    });

    it('makes exactly three transient attempts with 5s/15s waits, then nano, then Qwen', async () => {
        const order: string[] = [], waits: number[] = [];
        const failing = (name: string) => jest.fn(async () => { order.push(name); throw new AnalyticsStreamTimeoutError('first_token'); });
        const deepseek = failing('deepseek'), nano = failing('nano');
        const qwen = jest.fn(async () => { order.push('qwen'); return ok('qwen3.5:9b'); });
        const result = await runAnalyticsProviderChain([
            provider('deepseek', deepseek), provider('openai', nano), provider('ollama', qwen),
        ], { wait: async ms => { waits.push(ms); } });
        expect(order).toEqual(['deepseek', 'deepseek', 'deepseek', 'nano', 'qwen']);
        expect(waits).toEqual([5000, 15000]);
        expect(result.model).toBe('qwen3.5:9b');
    });

    it('can recover on the third DeepSeek attempt without invoking nano', async () => {
        const primary = jest.fn().mockRejectedValueOnce({ status: 503 }).mockRejectedValueOnce({ status: 429 }).mockResolvedValue(ok('deepseek-v4-pro'));
        const nano = jest.fn(), wait = jest.fn().mockResolvedValue(undefined);
        expect((await runAnalyticsProviderChain([provider('deepseek', primary), provider('openai', nano)], { wait })).model).toBe('deepseek-v4-pro');
        expect(primary).toHaveBeenCalledTimes(3);
        expect(nano).not.toHaveBeenCalled();
    });

    it.each([400, 401, 402, 403, 404, 422])('does not retry nontransient HTTP %i', async status => {
        const primary = jest.fn().mockRejectedValue({ status }), nano = jest.fn().mockResolvedValue(ok('gpt-5-nano'));
        const wait = jest.fn();
        await runAnalyticsProviderChain([provider('deepseek', primary), provider('openai', nano)], { wait });
        expect(primary).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
    });

    it('advances after malformed, truncated and schema-invalid responses instead of returning them', async () => {
        const primary = jest.fn()
            .mockResolvedValueOnce({ ...ok('deepseek'), content: 'not JSON' })
            .mockResolvedValueOnce({ ...ok('deepseek'), finishReason: 'length' })
            .mockResolvedValueOnce({ ...ok('deepseek'), content: '{"topic_tag_ids":["a","b"]}' });
        const nano = jest.fn().mockResolvedValue({ ...ok('nano'), content: '{"topic_tag_ids":["a"]}' });
        const result = await runAnalyticsProviderChain([provider('deepseek', primary), provider('openai', nano)], {
            wait: async () => {}, validate: content => { if (JSON.parse(content).topic_tag_ids.length !== 1) throw new Error('one topic'); },
        });
        expect(result.model).toBe('nano');
        expect(primary).toHaveBeenCalledTimes(3);
    });

    it('reports failure without exposing provider bodies, credentials or conversation', async () => {
        const call = jest.fn().mockRejectedValue(new Error('Bearer private-key; private transcript'));
        const onFailure = jest.fn();
        let error: AnalyticsProvidersUnavailableError;
        try { await runAnalyticsProviderChain([provider('deepseek', call)], { wait: async () => {}, onFailure }); }
        catch (caught) { error = caught as AnalyticsProvidersUnavailableError; }
        expect(error!).toBeInstanceOf(AnalyticsProvidersUnavailableError);
        expect(error!.attempts).toHaveLength(3);
        expect(JSON.stringify([error!.message, error!.attempts, onFailure.mock.calls])).not.toMatch(/private|Bearer/);
    });
});

describe('DeepSeek stream deadlines', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const limits = { firstTokenMs: 15000, idleMs: 15000, totalMs: 60000 };

    it('aborts a connection which never returns the first token', async () => {
        let signal: AbortSignal;
        const work = readAnalyticsStream(async s => { signal = s; return new Promise(() => {}); }, 'deepseek', limits);
        const assertion = expect(work).rejects.toMatchObject({ phase: 'first_token' });
        await jest.advanceTimersByTimeAsync(15000);
        await assertion;
        expect(signal!.aborted).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    });

    it('does not count HTTP connection, empty chunks or whitespace as generation progress', async () => {
        const work = readAnalyticsStream(async () => (async function* () {
            yield { choices: [{ delta: { role: 'assistant' } }] };
            await new Promise(r => setTimeout(r, 10000));
            yield { choices: [{ delta: { content: ' \n' } }] };
            await new Promise(() => {});
        })(), 'deepseek', limits);
        const assertion = expect(work).rejects.toMatchObject({ phase: 'first_token' });
        await jest.advanceTimersByTimeAsync(15000);
        await assertion;
    });

    it('aborts after 15s of stalled content after generation starts', async () => {
        const work = readAnalyticsStream(async () => (async function* () {
            yield { choices: [{ delta: { content: '{' } }] };
            await new Promise(() => {});
        })(), 'deepseek', limits);
        const assertion = expect(work).rejects.toMatchObject({ phase: 'idle' });
        await jest.advanceTimersByTimeAsync(15000);
        await assertion;
    });

    it('allows content progress and collects final usage without retrying', async () => {
        const work = readAnalyticsStream(async () => (async function* () {
            yield { model: 'deepseek-v4-pro', choices: [{ delta: { content: '{"ok":' } }] };
            await new Promise(r => setTimeout(r, 14000));
            yield { choices: [{ delta: { content: 'true}' }, finish_reason: 'stop' }] };
            yield { choices: [], usage: { total_tokens: 30 } };
        })(), 'deepseek', limits);
        await jest.advanceTimersByTimeAsync(14000);
        expect(await work).toEqual({ content: '{"ok":true}', model: 'deepseek-v4-pro', finishReason: 'stop', usage: { total_tokens: 30 } });
        expect(jest.getTimerCount()).toBe(0);
    });

    it('caps total duration even when content keeps arriving', async () => {
        const work = readAnalyticsStream(async () => (async function* () {
            for (let i = 0; i < 8; i++) {
                yield { choices: [{ delta: { content: 'x' } }] };
                await new Promise(r => setTimeout(r, 10000));
            }
        })(), 'deepseek', limits);
        const assertion = expect(work).rejects.toMatchObject({ phase: 'total' });
        await jest.advanceTimersByTimeAsync(60000);
        await assertion;
    });
});

describe('native analytics Ollama adapter', () => {
    it('sends think=false, the complete schema, context and a cancellable deadline', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
            model: 'qwen3.5:9b', done: true, done_reason: 'stop', message: { content: '{"ok":true}' }, prompt_eval_count: 10, eval_count: 5,
        }) });
        const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
        const result = await requestAnalyticsOllama('http://ollama:11434/', {
            model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'synthetic' }], max_tokens: 8192,
            response_format: { type: 'json_schema', json_schema: { schema } },
        }, fetchImpl as any);
        expect(fetchImpl.mock.calls[0][0]).toBe('http://ollama:11434/api/chat');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ think: false, format: schema, options: { num_ctx: 32768, num_predict: 8192 } });
        expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(result.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
    });
});
