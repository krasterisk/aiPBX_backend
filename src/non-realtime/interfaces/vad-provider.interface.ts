/**
 * VAD (Voice Activity Detection) provider interface.
 * Parameters are sourced from existing Assistant model fields:
 *   - turn_detection_threshold → threshold
 *   - turn_detection_silence_duration_ms → silenceDurationMs
 *   - turn_detection_prefix_padding_ms → prefixPaddingMs
 */

export interface VadConfig {
    /** Speech probability threshold (0.0–1.0). From assistant.turn_detection_threshold. Default: 0.5 */
    threshold: number;
    /** Silence duration (ms) to determine end-of-speech. From assistant.turn_detection_silence_duration_ms. Default: 500 */
    silenceDurationMs: number;
    /** Audio buffer before speech_start event (ms). From assistant.turn_detection_prefix_padding_ms. Default: 300 */
    prefixPaddingMs: number;
}

export interface VadResult {
    /** Whether speech is detected in this frame */
    isSpeech: boolean;
    /** Speech probability (0.0–1.0) */
    probability: number;
}

export interface IVadProvider {
    /** Provider name for logging */
    readonly name: string;

    /** Initialize VAD with config from Assistant model */
    init(config: VadConfig): Promise<void>;

    /** Process a PCM16 audio frame (16kHz mono). Returns speech detection result. */
    processSamples(pcm16: Buffer): Promise<VadResult>;

    /** Reset internal state (e.g. between calls) */
    reset(): void;

    /** Cleanup resources */
    destroy(): void;
}
