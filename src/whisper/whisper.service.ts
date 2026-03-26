import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITranscriptionProvider, TranscriptionResult } from '../operator-analytics/interfaces/operator-metrics.interface';
import axios from 'axios';
import FormData = require('form-data');

/**
 * Whisper STT provider.
 * Sends audio to a local Whisper Docker container (onerahmet/openai-whisper-asr-webservice)
 * running on GPU VPS via HTTP multipart/form-data.
 *
 * Required env vars:
 *   WHISPER_API_URL — base URL of the Whisper API (default: http://whisper:9000/asr)
 */
@Injectable()
export class WhisperService implements ITranscriptionProvider {
    private readonly logger = new Logger(WhisperService.name);
    private readonly whisperUrl: string;

    constructor(private readonly configService: ConfigService) {
        this.whisperUrl =
            this.configService.get<string>('WHISPER_API_URL')
            || process.env.WHISPER_API_URL
            || 'http://whisper:9000/asr';

        this.logger.log(`Whisper API URL: ${this.whisperUrl}`);
    }

    /**
     * Transcribe audio buffer using local Whisper container.
     * Implements ITranscriptionProvider for compatibility with OperatorAnalyticsService.
     */
    async transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult> {
        this.logger.log(`[Whisper] Transcribing "${filename}" (${buffer.length} bytes), language: ${language || 'auto'}`);

        const form = new FormData();
        form.append('audio_file', buffer, {
            filename,
            contentType: this.getMimeType(filename),
        });

        // Whisper ASR webservice query params
        const params: Record<string, string> = {
            task: 'transcribe',
            output: 'verbose_json',
        };

        // Some versions of the Whisper container expect output as a form field
        form.append('output', 'verbose_json');

        if (language && language !== 'auto') {
            params.language = language;
            form.append('language', language);
        }

        const headers: Record<string, string> = {
            ...form.getHeaders(),
        };

        let response;
        try {
            response = await axios.post(this.whisperUrl, form, {
                headers,
                params,
                responseType: 'text',  // Always get string, parse ourselves
                timeout: 300_000, // 5 min
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });
        } catch (err) {
            const status = err.response?.status || 502;
            const body = err.response?.data;
            const msg = typeof body === 'object'
                ? (body.error || body.message || JSON.stringify(body))
                : (body || err.message);
            this.logger.error(`[Whisper] Transcription failed: ${msg}`);
            throw new HttpException(`Whisper STT error: ${msg}`, status);
        }

        let parsed: any = response.data;

        // Whisper may return JSON with Content-Type: text/plain, so axios won't auto-parse
        if (typeof parsed === 'string') {
            try {
                parsed = JSON.parse(parsed);
                this.logger.debug(`[Whisper] Parsed string response as JSON, keys: ${Object.keys(parsed).join(', ')}`);
            } catch {
                // genuinely plain text — keep as-is
                this.logger.debug(`[Whisper] Response is plain text (${parsed.length} chars)`);
            }
        } else {
            this.logger.debug(`[Whisper] Response keys: ${typeof parsed === 'object' ? Object.keys(parsed).join(', ') : typeof parsed}`);
        }

        let text: string;
        let duration = 0;

        if (typeof parsed === 'string') {
            text = parsed;
        } else if (typeof parsed === 'object') {
            text = parsed.text || '';
            duration = parsed.duration || parsed.duration_seconds || 0;

            // Fallback: calculate duration from segments if top-level duration is missing
            if (!duration && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
                const lastSegment = parsed.segments[parsed.segments.length - 1];
                duration = lastSegment.end || 0;
                this.logger.log(`[Whisper] Duration extracted from segments: ${duration}s`);
            }
        } else {
            throw new HttpException(
                `Whisper returned unexpected response format: ${typeof parsed}`,
                HttpStatus.BAD_GATEWAY,
            );
        }

        // Final fallback: estimate duration from audio buffer if still 0
        if (!duration) {
            duration = this.estimateAudioDuration(buffer, filename);
            if (duration > 0) {
                this.logger.log(`[Whisper] Duration estimated from audio header: ${duration}s`);
            }
        }

        this.logger.log(`[Whisper] Transcription complete: ${text.length} chars, duration: ${duration}s`);

        return { text, duration };
    }

    /**
     * Health check — verify Whisper container is reachable.
     */
    async healthCheck(): Promise<{ status: string; url: string }> {
        const baseUrl = this.whisperUrl.replace(/\/asr\/?$/, '');
        try {
            await axios.get(baseUrl, { timeout: 5_000 });
            return { status: 'ok', url: this.whisperUrl };
        } catch (err) {
            return { status: 'unavailable', url: this.whisperUrl };
        }
    }

    /**
     * Estimate audio duration from the buffer by parsing MP3 frame headers
     * or WAV headers. Falls back to rough file-size-based estimate.
     */
    private estimateAudioDuration(buffer: Buffer, filename: string): number {
        const ext = filename.split('.').pop()?.toLowerCase();

        try {
            if (ext === 'wav') {
                return this.getWavDuration(buffer);
            }
            if (ext === 'mp3') {
                return this.getMp3Duration(buffer);
            }
        } catch (e) {
            this.logger.warn(`[Whisper] Audio header parse failed: ${e.message}`);
        }

        return 0;
    }

    /**
     * Parse WAV header to get exact duration.
     * WAV structure: RIFF header (44 bytes) with sample rate and data size.
     */
    private getWavDuration(buffer: Buffer): number {
        if (buffer.length < 44) return 0;

        // Verify RIFF header
        const riff = buffer.toString('ascii', 0, 4);
        const wave = buffer.toString('ascii', 8, 12);
        if (riff !== 'RIFF' || wave !== 'WAVE') return 0;

        const channels = buffer.readUInt16LE(22);
        const sampleRate = buffer.readUInt32LE(24);
        const bitsPerSample = buffer.readUInt16LE(34);

        if (!sampleRate || !channels || !bitsPerSample) return 0;

        const bytesPerSample = (bitsPerSample / 8) * channels;
        // Find 'data' chunk
        let dataSize = 0;
        for (let i = 36; i < buffer.length - 8; i++) {
            if (buffer.toString('ascii', i, i + 4) === 'data') {
                dataSize = buffer.readUInt32LE(i + 4);
                break;
            }
        }

        if (!dataSize) {
            // Fallback: approximate from total file size minus header
            dataSize = buffer.length - 44;
        }

        return Math.round(dataSize / (sampleRate * bytesPerSample));
    }

    /**
     * Calculate MP3 duration by walking all frames.
     * Works correctly for both CBR and VBR files.
     */
    private getMp3Duration(buffer: Buffer): number {
        // Skip ID3v2 tag if present
        let offset = 0;
        if (buffer.length > 10
            && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) { // "ID3"
            const size =
                (buffer[6] & 0x7F) << 21 |
                (buffer[7] & 0x7F) << 14 |
                (buffer[8] & 0x7F) << 7 |
                (buffer[9] & 0x7F);
            offset = 10 + size;
        }

        const MPEG_VERSIONS = [2.5, 0, 2, 1]; // index by version bits
        const SAMPLE_RATES: Record<number, number[]> = {
            1:   [44100, 48000, 32000],
            2:   [22050, 24000, 16000],
            2.5: [11025, 12000,  8000],
        };
        const SAMPLES_PER_FRAME: Record<number, Record<number, number>> = {
            // MPEG version -> layer -> samples
            1:   { 1: 384, 2: 1152, 3: 1152 },
            2:   { 1: 384, 2: 1152, 3: 576 },
            2.5: { 1: 384, 2: 1152, 3: 576 },
        };
        const BITRATE_TABLE: Record<string, number[]> = {
            'V1L1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
            'V1L2': [0, 32, 48, 56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
            'V1L3': [0, 32, 40, 48,  56,  64,  80,  96, 112, 128, 160, 192, 224, 256, 320, 0],
            'V2L1': [0, 32, 48, 56,  64,  80,  96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
            'V2L2': [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0],
            'V2L3': [0,  8, 16, 24,  32,  40,  48,  56,  64,  80,  96, 112, 128, 144, 160, 0],
        };

        let totalDuration = 0;
        let frameCount = 0;

        while (offset < buffer.length - 4) {
            // Find sync word
            if (buffer[offset] !== 0xFF || (buffer[offset + 1] & 0xE0) !== 0xE0) {
                offset++;
                continue;
            }

            const b1 = buffer[offset + 1];
            const b2 = buffer[offset + 2];

            const versionBits = (b1 >> 3) & 0x03;
            const layerBits = (b1 >> 1) & 0x03;
            const bitrateIndex = (b2 >> 4) & 0x0F;
            const sampleRateIndex = (b2 >> 2) & 0x03;
            const paddingBit = (b2 >> 1) & 0x01;

            const mpegVersion = MPEG_VERSIONS[versionBits];
            const layer = 4 - layerBits; // layerBits: 3=L1, 2=L2, 1=L3

            if (mpegVersion === 0 || layer > 3 || layer < 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
                offset++;
                continue;
            }

            const vKey = mpegVersion === 1 ? 'V1' : 'V2';
            const lKey = `L${layer}`;
            const bitrateArr = BITRATE_TABLE[`${vKey}${lKey}`];
            if (!bitrateArr) { offset++; continue; }

            const bitrate = bitrateArr[bitrateIndex] * 1000; // bps
            const sampleRateArr = SAMPLE_RATES[mpegVersion];
            if (!sampleRateArr) { offset++; continue; }
            const sampleRate = sampleRateArr[sampleRateIndex];
            if (!sampleRate || !bitrate) { offset++; continue; }

            const samplesPerFrame = SAMPLES_PER_FRAME[mpegVersion]?.[layer] || 1152;

            // Frame size calculation
            let frameSize: number;
            if (layer === 1) {
                frameSize = Math.floor((12 * bitrate / sampleRate + paddingBit) * 4);
            } else {
                frameSize = Math.floor(samplesPerFrame * (bitrate / 8) / sampleRate + paddingBit);
            }

            if (frameSize < 1) { offset++; continue; }

            totalDuration += samplesPerFrame / sampleRate;
            frameCount++;
            offset += frameSize;
        }

        if (frameCount > 0) {
            this.logger.debug(`[Whisper] MP3 frame counting: ${frameCount} frames, ${Math.round(totalDuration)}s`);
        }

        return Math.round(totalDuration);
    }

    private getMimeType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            m4a: 'audio/mp4',
            webm: 'audio/webm',
            flac: 'audio/flac',
        };
        return mimeMap[ext] || 'audio/mpeg';
    }
}
