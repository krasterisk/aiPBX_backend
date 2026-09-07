import { textFromContent } from './openai-compat.util';

export interface OllamaNativeChatOptions {
    baseUrl: string;
    numCtx: number;
    fetchImpl?: typeof fetch;
}

function ollamaBase(url: string): string {
    return url.replace(/\/$/, '').replace(/\/v1$/, '');
}

function parseToolArguments(args: unknown): Record<string, unknown> {
    if (args && typeof args === 'object' && !Array.isArray(args)) {
        return args as Record<string, unknown>;
    }
    if (typeof args === 'string' && args.trim()) {
        try {
            const parsed = JSON.parse(args);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        } catch {
            return { raw: args };
        }
    }
    return {};
}

function stringifyToolArguments(args: unknown): string {
    if (typeof args === 'string') return args;
    if (args == null) return '{}';
    try {
        return JSON.stringify(args);
    } catch {
        return '{}';
    }
}

export function toOllamaMessages(messages: unknown[]): unknown[] {
    return messages.map((raw) => {
        const message = (raw ?? {}) as {
            role?: string;
            content?: unknown;
            name?: string;
            thinking?: unknown;
            reasoning?: unknown;
            tool_calls?: unknown;
            tool_call_id?: string;
        };
        const out: Record<string, unknown> = {
            role: message.role || 'user',
            content: textFromContent(message.content),
        };
        if (message.role === 'tool') {
            const toolName = message.name || message.tool_call_id;
            if (toolName) out.tool_name = toolName;
        }
        const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
        if (calls.length) {
            out.tool_calls = calls.map((call) => {
                const rec = (call ?? {}) as { function?: { name?: string; arguments?: unknown } };
                return {
                    function: {
                        name: rec.function?.name || '',
                        arguments: parseToolArguments(rec.function?.arguments),
                    },
                };
            });
        }
        return out;
    });
}

export function toOpenAiCompletion(raw: any, model: string) {
    const message = raw?.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const mappedCalls = toolCalls.map((call: any, index: number) => ({
        id: call.id || `call_${index}`,
        type: 'function',
        function: {
            name: call.function?.name || '',
            arguments: stringifyToolArguments(call.function?.arguments),
        },
    }));
    const finish = mappedCalls.length
        ? 'tool_calls'
        : (raw?.done_reason === 'length' ? 'length' : 'stop');

    return {
        id: raw?.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: raw?.model || model,
        choices: [{
            index: 0,
            message: {
                role: message.role || 'assistant',
                content: message.content ?? '',
                ...(message.thinking ? { thinking: message.thinking } : {}),
                ...(message.reasoning ? { reasoning: message.reasoning } : {}),
                ...(mappedCalls.length ? { tool_calls: mappedCalls } : {}),
            },
            finish_reason: finish,
        }],
        usage: {
            prompt_tokens: raw?.prompt_eval_count,
            completion_tokens: raw?.eval_count,
            total_tokens: (raw?.prompt_eval_count ?? 0) + (raw?.eval_count ?? 0),
        },
    };
}

export function toOpenAiChunk(raw: any, model: string, id: string, emittedArgs: string[] = []) {
    const message = raw?.message ?? {};
    const content = typeof message.content === 'string' ? message.content : '';
    const thinking = typeof message.thinking === 'string' ? message.thinking : '';
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const delta: Record<string, unknown> = {};
    if (content) delta.content = content;
    if (thinking) delta.reasoning = thinking;
    if (toolCalls.length) {
        delta.tool_calls = toolCalls.map((call: any, index: number) => {
            const full = stringifyToolArguments(call.function?.arguments);
            const prev = emittedArgs[index] ?? '';
            const argDelta = full.startsWith(prev) ? full.slice(prev.length) : full;
            emittedArgs[index] = full;
            return {
                index,
                id: call.id || `call_${index}`,
                type: 'function',
                function: {
                    name: call.function?.name || '',
                    arguments: argDelta,
                },
            };
        });
    }

    return {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: raw?.model || model,
        choices: [{
            index: 0,
            delta,
            finish_reason: raw?.done ? (toolCalls.length ? 'tool_calls' : (raw?.done_reason === 'length' ? 'length' : 'stop')) : null,
        }],
    };
}

async function* readNdjson(res: Response): AsyncGenerator<any> {
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (line) yield JSON.parse(line);
            nl = buf.indexOf('\n');
        }
    }
    if (buf.trim()) yield JSON.parse(buf.trim());
}

export class OllamaNativeChat {
    private readonly baseUrl: string;
    private readonly numCtx: number;
    private readonly fetchImpl: typeof fetch;

    constructor(options: OllamaNativeChatOptions) {
        this.baseUrl = ollamaBase(options.baseUrl);
        this.numCtx = options.numCtx;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    asOpenAiClient() {
        return {
            chat: {
                completions: {
                    create: (params: Record<string, unknown>, opts?: { signal?: AbortSignal }) =>
                        this.create(params, opts),
                },
            },
        };
    }

    async create(params: Record<string, unknown>, opts?: { signal?: AbortSignal }) {
        const model = String(params.model || '');
        const incomingOptions = (params.options && typeof params.options === 'object')
            ? params.options as Record<string, unknown>
            : {};
        const body: Record<string, unknown> = {
            model,
            messages: toOllamaMessages(Array.isArray(params.messages) ? params.messages : []),
            stream: !!params.stream,
            keep_alive: incomingOptions.keep_alive ?? params.keep_alive ?? -1,
            options: {
                num_ctx: incomingOptions.num_ctx ?? this.numCtx,
                ...(incomingOptions.temperature != null ? { temperature: incomingOptions.temperature } : {}),
                ...(incomingOptions.num_predict != null ? { num_predict: incomingOptions.num_predict } : {}),
                ...(params.temperature != null && incomingOptions.temperature == null
                    ? { temperature: params.temperature }
                    : {}),
                ...(params.max_tokens != null && incomingOptions.num_predict == null
                    ? { num_predict: params.max_tokens }
                    : {}),
            },
        };
        if (Array.isArray(params.tools) && params.tools.length) {
            body.tools = params.tools;
            if (params.tool_choice != null) body.tool_choice = params.tool_choice;
        }

        const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: opts?.signal,
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Ollama /api/chat ${response.status} ${detail.slice(0, 300)}`);
        }

        if (params.stream) {
            const id = `chatcmpl-${Date.now()}`;
            return this.iterateStream(response, model, id);
        }

        const raw = await response.json();
        return toOpenAiCompletion(raw, model);
    }

    private async *iterateStream(response: Response, model: string, id: string) {
        const emittedArgs: string[] = [];
        for await (const raw of readNdjson(response)) {
            yield toOpenAiChunk(raw, model, id, emittedArgs);
        }
    }
}
