export const DEEPSEEK_RETRY_DELAYS_MS = [5_000, 15_000] as const;
export const DEEPSEEK_STREAM_LIMITS = { firstTokenMs: 15_000, idleMs: 15_000, totalMs: 60_000 } as const;

export function resolveInsightsDeepSeekModel(value = process.env.ANALYTICS_INSIGHTS_DEEPSEEK_MODEL): string {
    return value?.trim() || 'deepseek-v4-pro';
}

export interface AnalyticsCompletion {
    content: string;
    model: string;
    usage?: any;
    finishReason?: string | null;
}

export interface AnalyticsProvider {
    id: 'deepseek' | 'openai' | 'ollama';
    model: string;
    call: () => Promise<AnalyticsCompletion>;
}

export interface AnalyticsProviderAttempt {
    provider: AnalyticsProvider['id'];
    model: string;
    attempt: number;
    reason: string;
}

export class AnalyticsProvidersUnavailableError extends Error {
    constructor(readonly attempts: AnalyticsProviderAttempt[]) {
        super('All analytics LLM providers are unavailable or returned invalid responses');
        this.name = 'AnalyticsProvidersUnavailableError';
    }
}

export class AnalyticsStreamTimeoutError extends Error {
    readonly code = 'ETIMEDOUT';
    constructor(readonly phase: 'first_token' | 'idle' | 'total') {
        super(`Analytics stream timed out: ${phase}`);
        this.name = 'AnalyticsStreamTimeoutError';
    }
}

function errorCategory(error: any): string {
    const status = Number(error?.status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return `http_${status}`;
    if (error instanceof AnalyticsStreamTimeoutError) return `timeout_${error.phase}`;
    if (error?.code === 'ETIMEDOUT' || /Timeout/.test(String(error?.name))) return 'timeout';
    if (error?.code === 'INVALID_ANALYTICS_RESPONSE') return 'invalid_response';
    return 'request_failed';
}

function retryable(error: any): boolean {
    const status = Number(error?.status);
    return !Number.isInteger(status) || status === 408 || status === 409 || status === 429 || status >= 500;
}

export async function runAnalyticsProviderChain(
    providers: AnalyticsProvider[],
    options: {
        validate?: (content: string) => void;
        onFailure?: (attempt: AnalyticsProviderAttempt) => void;
        wait?: (ms: number) => Promise<void>;
    } = {},
): Promise<AnalyticsCompletion> {
    const attempts: AnalyticsProviderAttempt[] = [];
    const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    for (const provider of providers) {
        const maxAttempts = provider.id === 'deepseek' ? 3 : 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const result = await provider.call();
                try {
                    if (!result.content?.trim() || (result.finishReason != null && result.finishReason !== 'stop')) {
                        throw new Error('Empty, truncated or refused response');
                    }
                    const body = JSON.parse(result.content);
                    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected JSON object');
                    options.validate?.(result.content);
                } catch {
                    throw Object.assign(new Error('Invalid analytics response'), { code: 'INVALID_ANALYTICS_RESPONSE' });
                }
                return result;
            } catch (error) {
                const metadata = { provider: provider.id, model: provider.model, attempt, reason: errorCategory(error) };
                attempts.push(metadata);
                options.onFailure?.(metadata);
                if (attempt >= maxAttempts || !retryable(error)) break;
                await wait(DEEPSEEK_RETRY_DELAYS_MS[attempt - 1]);
            }
        }
    }
    throw new AnalyticsProvidersUnavailableError(attempts);
}

/** Deadlines track content, not connection headers, SSE keepalives or empty chunks. */
export async function readAnalyticsStream(
    open: (signal: AbortSignal) => Promise<AsyncIterable<any>>,
    model: string,
    limits: { firstTokenMs: number; idleMs: number; totalMs: number } = DEEPSEEK_STREAM_LIMITS,
): Promise<AnalyticsCompletion> {
    const controller = new AbortController();
    let rejectDeadline: (error: Error) => void;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    const expire = (phase: 'first_token' | 'idle' | 'total') => {
        const error = new AnalyticsStreamTimeoutError(phase);
        rejectDeadline(error);
        controller.abort(error);
    };
    let progressTimer = setTimeout(() => expire('first_token'), limits.firstTokenMs);
    const totalTimer = setTimeout(() => expire('total'), limits.totalMs);
    const consume = async (): Promise<AnalyticsCompletion> => {
        const stream = await open(controller.signal);
        let content = '', actualModel = model, usage: any, finishReason: string | null = null;
        for await (const chunk of stream) {
            if (controller.signal.aborted) throw controller.signal.reason;
            if (typeof chunk.model === 'string' && chunk.model) actualModel = chunk.model;
            if (chunk.usage) usage = chunk.usage;
            const choice = chunk.choices?.[0];
            const delta = choice?.delta?.content;
            if (typeof delta === 'string' && delta.length) {
                content += delta;
                if (delta.trim()) {
                    clearTimeout(progressTimer);
                    progressTimer = setTimeout(() => expire('idle'), limits.idleMs);
                }
            }
            if (choice?.finish_reason) finishReason = choice.finish_reason;
        }
        if (finishReason !== 'stop') throw Object.assign(new Error('Incomplete analytics stream'), { code: 'INVALID_ANALYTICS_RESPONSE' });
        return { content, model: actualModel, usage, finishReason };
    };
    try {
        return await Promise.race([consume(), deadline]);
    } finally {
        clearTimeout(progressTimer);
        clearTimeout(totalTimer);
        controller.abort();
    }
}

/** Use the native Ollama API so think=false and JSON controls actually reach Qwen. */
export async function requestAnalyticsOllama(
    baseUrl: string,
    params: Record<string, any>,
    fetchImpl: typeof fetch = fetch,
): Promise<any> {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
            model: params.model,
            messages: params.messages,
            stream: false,
            think: false,
            keep_alive: -1,
            format: params.response_format?.json_schema?.schema ?? 'json',
            options: { temperature: params.temperature ?? 0, num_ctx: 32768, num_predict: params.max_tokens ?? 8192 },
        }),
    });
    if (!response.ok) throw Object.assign(new Error('Ollama request failed'), { status: response.status });
    const body = await response.json();
    if (body.error || body.done !== true) throw new Error('Incomplete Ollama response');
    const promptTokens = body.prompt_eval_count || 0, outputTokens = body.eval_count || 0;
    return {
        model: body.model || params.model,
        choices: [{ message: { content: body.message?.content || '' }, finish_reason: body.done_reason === 'length' ? 'length' : 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: outputTokens, total_tokens: promptTokens + outputTokens },
    };
}
