/**
 * LLM (Large Language Model) provider interface.
 * Providers: openai (Chat Completions), yandex (YandexGPT), ollama (local Llama)
 *
 * All providers must support:
 *   - Streaming text generation (for sentence-level TTS pipelining)
 *   - Function/tool calling (same tools as realtime mode)
 */

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string;
    tool_calls?: LlmToolCall[];
    tool_call_id?: string;
    name?: string;
}

export interface LlmToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface LlmTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface LlmOptions {
    model: string;
    temperature?: number;
    maxTokens?: number;
    toolChoice?: string;
}

export interface LlmDelta {
    /** Text content delta */
    text?: string;
    /** Tool calls (accumulated, sent on completion) */
    toolCalls?: LlmToolCall[];
    /** Whether this is the final delta (stream ended) */
    done: boolean;
    /** Usage info (only on final delta, if available) */
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface ILlmProvider {
    /** Provider name for logging */
    readonly name: string;

    /**
     * Stream a chat completion.
     * Yields text deltas as they arrive for sentence-level TTS pipelining.
     * Tool calls are accumulated and yielded when complete.
     * @param messages Conversation history
     * @param tools Available tools (from Assistant.tools + built-in hangup/transfer)
     * @param options Model, temperature, etc.
     * @param signal AbortSignal for interrupt support
     */
    chatStream(
        messages: LlmMessage[],
        tools: LlmTool[],
        options: LlmOptions,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta>;
}
