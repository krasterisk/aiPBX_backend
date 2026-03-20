/**
 * TTS (Text-to-Speech) provider interface.
 * Providers: silero (Docker CPU), openai-tts (API), yandex-tts (API)
 *
 * All providers must return PCM16 audio chunks as an async iterable
 * for streaming playback through StreamAudioService.
 */

export interface TtsOptions {
    /** Voice identifier (provider-specific: 'baya', 'alloy', etc.) */
    voice: string;
    /** Output sample rate. Default: 8000 (telephony) */
    sampleRate?: number;
    /** Language hint (e.g. 'ru', 'en') */
    language?: string;
}

export interface ITtsProvider {
    /** Provider name for logging */
    readonly name: string;

    /** Native output sample rate of this provider */
    readonly outputSampleRate: number;

    /**
     * Synthesize text to PCM16 audio.
     * Returns an async iterable of PCM16 audio chunks for streaming playback.
     * @param text Text to synthesize
     * @param options Voice, sample rate, language
     * @param signal AbortSignal for interrupt support
     */
    synthesize(
        text: string,
        options: TtsOptions,
        signal?: AbortSignal,
    ): AsyncIterable<Buffer>;
}
