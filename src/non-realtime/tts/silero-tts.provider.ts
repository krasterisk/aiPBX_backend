import { Logger } from '@nestjs/common';
import { ITtsProvider, TtsOptions } from '../interfaces/tts-provider.interface';
import axios from 'axios';

/**
 * Silero TTS Provider.
 *
 * Sends text to local Silero TTS Docker container via HTTP.
 * The container runs a FastAPI server that returns PCM16 audio.
 *
 * Expected endpoint: POST /tts?text=...&speaker=...&language=...&sample_rate=...
 * Returns: audio/pcm (raw PCM16 LE mono)
 *
 * Runs on CPU, ~50ms per phrase, ~100 MB RAM.
 */
export class SileroTtsProvider implements ITtsProvider {
    readonly name = 'silero';
    readonly outputSampleRate = 48000; // Silero TTS native rate
    private readonly logger = new Logger(SileroTtsProvider.name);
    private readonly ttsUrl: string;

    constructor(ttsUrl?: string) {
        this.ttsUrl = ttsUrl
            || process.env.SILERO_TTS_URL
            || 'http://silero-tts:9001/tts';
    }

    async *synthesize(
        text: string,
        options: TtsOptions,
        signal?: AbortSignal,
    ): AsyncIterable<Buffer> {
        if (!text || text.trim().length === 0) return;

        const voice = options.voice || 'baya';
        const language = options.language || 'ru';
        // Request at native sample rate; resampling to 8kHz is done by the orchestrator
        const sampleRate = this.outputSampleRate;

        this.logger.debug(`[Silero TTS] Synthesizing: "${text.substring(0, 50)}..." voice=${voice} lang=${language}`);

        try {
            const response = await axios.post(this.ttsUrl, null, {
                params: {
                    text,
                    speaker: voice,
                    language,
                    sample_rate: sampleRate,
                },
                responseType: 'arraybuffer',
                timeout: 15_000,
                signal: signal as any,
            });

            if (signal?.aborted) return;

            const audioBuffer = Buffer.from(response.data);
            this.logger.debug(`[Silero TTS] Generated ${audioBuffer.length} bytes (${(audioBuffer.length / 2 / sampleRate).toFixed(2)}s)`);

            // Yield in chunks for streaming playback (~100ms chunks)
            const chunkSamples = Math.floor(sampleRate * 0.1); // 100ms worth of samples
            const chunkBytes = chunkSamples * 2; // PCM16 = 2 bytes per sample

            for (let offset = 0; offset < audioBuffer.length; offset += chunkBytes) {
                if (signal?.aborted) return;
                yield audioBuffer.subarray(offset, Math.min(offset + chunkBytes, audioBuffer.length));
            }

        } catch (err) {
            if (signal?.aborted) return;
            if (axios.isCancel(err)) return;
            this.logger.error(`[Silero TTS] Error: ${err.message}`);
            throw err;
        }
    }

    /**
     * Health check for Silero TTS container.
     */
    async healthCheck(): Promise<{ status: string; url: string }> {
        const healthUrl = this.ttsUrl.replace(/\/tts\/?$/, '/health');
        try {
            await axios.get(healthUrl, { timeout: 5_000 });
            return { status: 'ok', url: this.ttsUrl };
        } catch {
            return { status: 'unavailable', url: this.ttsUrl };
        }
    }
}
