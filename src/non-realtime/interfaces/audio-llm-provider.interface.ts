/**
 * Audio-native LLM provider interface.
 * Extends ILlmProvider to add audio input support.
 *
 * Providers like Gemma 4 E4B can accept audio directly,
 * skipping the STT step entirely.
 *
 * Falls back to text-only chatStream() for tool-call re-runs
 * (after tool execution, only text is available).
 */

import {
    ILlmProvider,
    LlmDelta,
    LlmMessage,
    LlmTool,
    LlmOptions,
} from './llm-provider.interface';

export interface IAudioLlmProvider extends ILlmProvider {
    /** Whether this provider supports audio input natively */
    readonly supportsAudioInput: boolean;

    /**
     * Stream a chat completion with audio input.
     * The audio buffer replaces the latest user turn —
     * the model transcribes and responds in one step.
     *
     * @param audioBuffer PCM16 16kHz mono audio (raw speech segment from VAD)
     * @param messages Conversation history (previous turns only; current user turn is the audio)
     * @param tools Available tools
     * @param options Model, temperature, etc.
     * @param signal AbortSignal for interrupt support
     */
    chatStreamWithAudio(
        audioBuffer: Buffer,
        messages: LlmMessage[],
        tools: LlmTool[],
        options: LlmOptions,
        signal?: AbortSignal,
    ): AsyncIterable<LlmDelta>;
}

/**
 * Type guard: check if an ILlmProvider is also an IAudioLlmProvider.
 */
export function isAudioLlmProvider(provider: ILlmProvider): provider is IAudioLlmProvider {
    return 'supportsAudioInput' in provider && (provider as IAudioLlmProvider).supportsAudioInput === true;
}
