/**
 * STT (Speech-to-Text) provider interface.
 * Providers: whisper-local (GPU Docker), vosk (CPU), whisper-api (OpenAI), yandex-stt
 */

export interface SttResult {
    /** Transcribed text */
    text: string;
    /** Audio duration in seconds (if available) */
    duration?: number;
    /** Detected language (if available) */
    language?: string;
}

export interface ISttProvider {
    /** Provider name for logging */
    readonly name: string;

    /** Whether this provider supports streaming (Vosk/Deepgram) vs batch (Whisper) */
    readonly isStreaming: boolean;

    /**
     * Transcribe a complete audio buffer (batch mode).
     * Used after VAD collects a full speech segment.
     * @param audioBuffer PCM16 16kHz mono audio
     * @param language Optional language hint (e.g. 'ru', 'en')
     */
    transcribe(audioBuffer: Buffer, language?: string): Promise<SttResult>;
}
