import { Logger } from '@nestjs/common';
import {
    ILlmProvider,
    LlmDelta,
    LlmMessage,
    LlmTool,
    LlmToolCall,
    LlmOptions,
} from '../interfaces/llm-provider.interface';
import { IAudioLlmProvider } from '../interfaces/audio-llm-provider.interface';
import OpenAI from 'openai';

/**
 * Gemma 4 Audio-Native LLM Provider.
 *
 * Uses Ollama's OpenAI-compatible API with multimodal audio input.
 * Gemma 4 E4B natively accepts audio via its USM encoder (~300M params),
 * processing 160ms chunks at ~6.25 tokens/second.
 *
 * Two modes:
 *   - chatStreamWithAudio(): sends PCM16 audio as base64 in a multimodal message (skips STT)
 *   - chatStream(): pure text mode (used for tool-call re-runs after tool execution)
 *
 * Requires Ollama with Gemma 4 model pulled:
 *   ollama pull gemma4:e4b
 */
export class Gemma4AudioLlmProvider implements IAudioLlmProvider {
    readonly name = 'gemma4-audio';
    readonly supportsAudioInput = true;
    private readonly logger = new Logger(Gemma4AudioLlmProvider.name);
    private readonly client: OpenAI;
    private readonly ollamaBaseUrl: string;

    constructor(baseUrl?: string) {
        this.ollamaBaseUrl = baseUrl || process.env.OLLAMA_URL || 'http://ollama:11434/v1';
        this.client = new OpenAI({
            baseURL: this.ollamaBaseUrl,
            apiKey: 'ollama', // Ollama doesn't need a key
        });
    }

    // ── Audio-native mode (Pipeline B: skip STT) ─────────────

    async *chatStreamWithAudio(
        audioBuffer: Buffer,
        messages: LlmMessage[],
        tools: LlmTool[],
        options: LlmOptions,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta> {
        const model = options.model || 'gemma4:e4b';

        // Build WAV from PCM16 16kHz mono buffer
        const wavBuffer = this.buildWavBuffer(audioBuffer, 16000, 1, 16);
        const audioBase64 = wavBuffer.toString('base64');

        // Build message list with audio as the latest user turn
        const openAiMessages: any[] = messages.map(m => this.toOpenAiMessage(m));

        // Add audio as multimodal user message
        // Ollama multimodal format: content as array with text + audio parts
        openAiMessages.push({
            role: 'user',
            content: [
                {
                    type: 'audio',
                    audio: {
                        data: audioBase64,
                        format: 'wav',
                    },
                },
            ],
        });

        this.logger.log(`[Gemma4Audio] Sending ${audioBuffer.length} bytes audio to ${model}`);

        yield* this.streamCompletion(openAiMessages, tools, options, model, signal);
    }

    // ── Text-only mode (for tool-call re-runs) ───────────────

    async *chatStream(
        messages: LlmMessage[],
        tools: LlmTool[],
        options: LlmOptions,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta> {
        const model = options.model || 'gemma4:e4b';
        const openAiMessages = messages.map(m => this.toOpenAiMessage(m));

        yield* this.streamCompletion(openAiMessages, tools, options, model, signal);
    }

    // ── Shared streaming logic ───────────────────────────────

    private async *streamCompletion(
        openAiMessages: any[],
        tools: LlmTool[],
        options: LlmOptions,
        model: string,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta> {
        const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model,
            messages: openAiMessages,
            stream: true,
            temperature: options.temperature ?? 0.8,
        };

        if (options.maxTokens) {
            params.max_tokens = options.maxTokens;
        }

        if (tools.length > 0) {
            params.tools = tools.map(t => ({
                type: 'function' as const,
                function: t.function,
            }));
            params.tool_choice = (options.toolChoice || 'auto') as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption;
        }

        try {
            const stream = await this.client.chat.completions.create(params, {
                signal: signal as any,
            });

            const toolCallAccumulator = new Map<number, {
                id: string;
                name: string;
                arguments: string;
            }>();

            for await (const chunk of stream) {
                if (signal?.aborted) return;

                const choice = chunk.choices?.[0];
                if (!choice) {
                    if (chunk.usage) {
                        yield {
                            done: true,
                            usage: {
                                promptTokens: chunk.usage.prompt_tokens,
                                completionTokens: chunk.usage.completion_tokens,
                                totalTokens: chunk.usage.total_tokens,
                            },
                        };
                    }
                    continue;
                }

                const delta = choice.delta;

                // Text content
                if (delta?.content) {
                    yield { text: delta.content, done: false };
                }

                // Tool calls
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index;
                        if (!toolCallAccumulator.has(idx)) {
                            toolCallAccumulator.set(idx, {
                                id: tc.id || `call_${Date.now()}_${idx}`,
                                name: tc.function?.name || '',
                                arguments: '',
                            });
                        }
                        const acc = toolCallAccumulator.get(idx)!;
                        if (tc.id) acc.id = tc.id;
                        if (tc.function?.name) acc.name = tc.function.name;
                        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
                    }
                }

                // Finished
                if (choice.finish_reason) {
                    const toolCalls: LlmToolCall[] = [];

                    if (choice.finish_reason === 'tool_calls' && toolCallAccumulator.size > 0) {
                        for (const [, tc] of toolCallAccumulator) {
                            toolCalls.push({
                                id: tc.id,
                                type: 'function',
                                function: {
                                    name: tc.name,
                                    arguments: tc.arguments,
                                },
                            });
                        }
                    }

                    yield {
                        done: true,
                        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                        usage: chunk.usage ? {
                            promptTokens: chunk.usage.prompt_tokens,
                            completionTokens: chunk.usage.completion_tokens,
                            totalTokens: chunk.usage.total_tokens,
                        } : undefined,
                    };
                }
            }
        } catch (err) {
            if (signal?.aborted) return;
            this.logger.error(`[Gemma4Audio] Stream error: ${err.message}`);
            throw err;
        }
    }

    // ── Helpers ───────────────────────────────────────────────

    /**
     * Check if Ollama is reachable and has a Gemma 4 model available.
     */
    async healthCheck(): Promise<{ status: string; models?: string[]; url?: string }> {
        try {
            const ollamaBase = this.ollamaBaseUrl.replace('/v1', '');
            const res = await fetch(`${ollamaBase}/api/tags`);
            const data = await res.json();
            const allModels: string[] = data.models?.map((m: any) => m.name) || [];
            const gemmaModels = allModels.filter(name =>
                name.includes('gemma4') || name.includes('gemma-4'),
            );
            return {
                status: gemmaModels.length > 0 ? 'ok' : 'no-gemma4-model',
                models: gemmaModels.length > 0 ? gemmaModels : allModels,
            };
        } catch {
            return { status: 'unavailable', url: this.ollamaBaseUrl };
        }
    }

    /**
     * Build a minimal WAV file from raw PCM16 data.
     * Gemma 4 USM encoder expects WAV format.
     */
    private buildWavBuffer(
        pcmData: Buffer,
        sampleRate: number,
        numChannels: number,
        bitsPerSample: number,
    ): Buffer {
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.length;
        const headerSize = 44;

        const header = Buffer.alloc(headerSize);

        // RIFF header
        header.write('RIFF', 0);
        header.writeUInt32LE(dataSize + headerSize - 8, 4);
        header.write('WAVE', 8);

        // fmt sub-chunk
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);                   // SubChunk1Size (PCM)
        header.writeUInt16LE(1, 20);                    // AudioFormat (PCM = 1)
        header.writeUInt16LE(numChannels, 22);          // NumChannels
        header.writeUInt32LE(sampleRate, 24);           // SampleRate
        header.writeUInt32LE(byteRate, 28);             // ByteRate
        header.writeUInt16LE(blockAlign, 32);           // BlockAlign
        header.writeUInt16LE(bitsPerSample, 34);        // BitsPerSample

        // data sub-chunk
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);

        return Buffer.concat([header, pcmData]);
    }

    private toOpenAiMessage(msg: LlmMessage): any {
        const result: any = { role: msg.role, content: msg.content ?? null };

        if (msg.tool_calls) {
            result.tool_calls = msg.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            }));
        }

        if (msg.tool_call_id) {
            result.tool_call_id = msg.tool_call_id;
        }

        if (msg.name) {
            result.name = msg.name;
        }

        return result;
    }
}
