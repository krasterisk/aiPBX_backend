import { Logger } from '@nestjs/common';
import { ITtsProvider, TtsOptions } from '../interfaces/tts-provider.interface';
import axios from 'axios';

/**
 * OmniVoice TTS Provider.
 *
 * Sends text to OmniVoice TTS container (GPU) via HTTP.
 * OmniVoice is a diffusion-based TTS model supporting 600+ languages,
 * voice cloning, and expressive speech.
 *
 * Expected container API:
 *   POST /tts
 *   Body: JSON { text, voice, language, sample_rate }
 *   Returns: audio/pcm (raw PCM16 LE mono)
 *
 * Runs on GPU, ~4-6 GB VRAM (FP16), ~3.5 GB (INT8), ~2.2 GB (INT4).
 */
export class OmniVoiceTtsProvider implements ITtsProvider {
    readonly name = 'omnivoice';
    readonly outputSampleRate = 24000; // OmniVoice native rate
    private readonly logger = new Logger(OmniVoiceTtsProvider.name);
    private readonly ttsUrl: string;

    constructor(ttsUrl?: string) {
        this.ttsUrl = ttsUrl
            || process.env.OMNIVOICE_TTS_URL
            || 'http://omnivoice-tts:9002/tts';
    }

    async *synthesize(
        text: string,
        options: TtsOptions,
        signal?: AbortSignal,
    ): AsyncIterable<Buffer> {
        if (!text || text.trim().length === 0) return;

        const voice = options.voice || 'default';
        const language = options.language || 'ru';

        this.logger.debug(
            `[OmniVoice] Synthesizing: "${text.substring(0, 50)}..." voice=${voice} lang=${language}`,
        );

        try {
            const response = await axios.post(
                this.ttsUrl,
                {
                    text,
                    voice,
                    language,
                    sample_rate: this.outputSampleRate,
                },
                {
                    responseType: 'arraybuffer',
                    timeout: 30_000, // OmniVoice may be slower than Silero due to diffusion steps
                    signal: signal as any,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (signal?.aborted) return;

            const audioBuffer = Buffer.from(response.data);
            this.logger.debug(
                `[OmniVoice] Generated ${audioBuffer.length} bytes (${(audioBuffer.length / 2 / this.outputSampleRate).toFixed(2)}s)`,
            );

            // Yield in chunks for streaming playback (~100ms chunks)
            const chunkSamples = Math.floor(this.outputSampleRate * 0.1); // 100ms
            const chunkBytes = chunkSamples * 2; // PCM16 = 2 bytes/sample

            for (let offset = 0; offset < audioBuffer.length; offset += chunkBytes) {
                if (signal?.aborted) return;
                yield audioBuffer.subarray(offset, Math.min(offset + chunkBytes, audioBuffer.length));
            }
        } catch (err) {
            if (signal?.aborted) return;
            if (axios.isCancel(err)) return;

            // Extract concise error info from Axios response
            if (err.response) {
                const status = err.response.status;
                const body = err.response.data
                    ? Buffer.from(err.response.data).toString('utf-8').substring(0, 200)
                    : 'no body';
                this.logger.error(`[OmniVoice] HTTP ${status}: ${body}`);
            } else {
                this.logger.error(`[OmniVoice] ${err.code || 'Error'}: ${err.message}`);
            }
            throw err;
        }
    }

    /**
     * Health check for OmniVoice TTS container.
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
