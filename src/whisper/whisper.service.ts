import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITranscriptionProvider, TranscriptionResult } from '../operator-analytics/interfaces/operator-metrics.interface';
import { countTranscriptionWords } from '../operator-analytics/lib/assess-transcription-quality';
import { buildWhisperAsrUrl, parseWhisperAsrResponse } from './lib/whisper-asr-response';
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
    /**
     * Silero VAD drops short leading speech — telephony greetings that start at
     * t≈0 right after a beep get cut. Off by default; enable per-install only.
     */
    private readonly vadFilter: boolean;

    constructor(private readonly configService: ConfigService) {
        this.whisperUrl =
            this.configService.get<string>('WHISPER_API_URL')
            || process.env.WHISPER_API_URL
            || 'http://whisper:9000/asr';

        const rawVad = (
            this.configService.get<string>('WHISPER_VAD_FILTER')
            || process.env.WHISPER_VAD_FILTER
            || 'false'
        ).trim().toLowerCase();
        this.vadFilter = rawVad === 'true' || rawVad === '1' || rawVad === 'on';

        this.logger.log(`Whisper API URL: ${this.whisperUrl} (vad_filter=${this.vadFilter})`);
    }

    /**
     * Transcribe audio buffer using local Whisper container.
     * Implements ITranscriptionProvider for compatibility with OperatorAnalyticsService.
     */
    async transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult> {
        this.logger.log(`[Whisper] Transcribing "${filename}" (${buffer.length} bytes), language: ${language || 'auto'}`);

        const asrUrl = buildWhisperAsrUrl(this.whisperUrl, { language, vadFilter: this.vadFilter });
        this.logger.log(`[Whisper] ASR ${asrUrl}`);

        let response;
        try {
            response = await this.postAsr(asrUrl, buffer, filename);
        } catch (err) {
            const status = (err as any).response?.status || 502;
            const body = (err as any).response?.data;
            let detail: string;
            if (typeof body === 'object' && body != null) {
                detail = body.detail
                    ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail))
                    : (body.error || body.message || JSON.stringify(body));
            } else if (typeof body === 'string' && body.trim()) {
                detail = body.length > 500 ? `${body.slice(0, 500)}…` : body;
            } else {
                detail = (err as Error).message || 'unknown error';
            }
            this.logger.error(`[Whisper] Transcription failed (${status}): ${detail}`);
            throw new HttpException(`Whisper STT error: ${detail}`, status);
        }

        const disposition = String(response.headers?.['content-disposition'] || '');
        const parsed = parseWhisperAsrResponse(response.data);
        if (!parsed.structured || parsed.segments.length === 0) {
            const preview = (parsed.text || '').slice(0, 80).replace(/\s+/g, ' ');
            this.logger.warn(
                `[Whisper] No JSON/VTT segments (${parsed.text.length} chars, ` +
                `disposition=${disposition || 'n/a'}) preview="${preview}"`,
            );
        } else {
            this.logger.debug(
                `[Whisper] Parsed ASR: segs=${parsed.segments.length} lang=${parsed.language || '?'} disposition=${disposition || 'n/a'}`,
            );
        }

        const text = parsed.text;
        let duration = parsed.duration || 0;

        if (!duration && parsed.segments.length > 0) {
            duration = parsed.segments[parsed.segments.length - 1].end || 0;
            this.logger.log(`[Whisper] Duration extracted from segments: ${duration}s`);
        }

        // Final fallback: estimate duration from audio buffer if still 0
        if (!duration) {
            duration = this.estimateAudioDuration(buffer, filename);
            if (duration > 0) {
                this.logger.log(`[Whisper] Duration estimated from audio header: ${duration}s`);
            }
        }

        const firstStart = parsed.segments[0]?.start;
        this.logger.log(
            `[Whisper] Transcription complete: ${text.length} chars, duration: ${duration}s, ` +
            `segs=${parsed.segments.length}, firstSegStart=${firstStart != null ? firstStart.toFixed(2) : 'n/a'}s`,
        );
        // A late first segment means the opening greeting never reached the transcript.
        if (firstStart != null && firstStart > 1.5) {
            this.logger.warn(
                `[Whisper] Transcript starts at ${firstStart.toFixed(2)}s — leading speech may be cut ` +
                `(vad_filter=${this.vadFilter})`,
            );
        }

        return { text, duration, ...this.extractSegmentSignals(parsed, text) };
    }

    private async postAsr(asrUrl: string, buffer: Buffer, filename: string) {
        const form = new FormData();
        form.append('audio_file', buffer, {
            filename,
            contentType: this.getMimeType(filename),
        });
        return axios.post(asrUrl, form, {
            headers: form.getHeaders(),
            responseType: 'text',
            timeout: 300_000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
    }

    private extractSegmentSignals(
        parsed: ReturnType<typeof parseWhisperAsrResponse>,
        text: string,
    ): Partial<TranscriptionResult> {
        const rawSegments = parsed.segments;
        let totalWeight = 0;
        let avgLogprobSum = 0;
        let noSpeechSum = 0;
        let maxCompression = 0;

        for (const seg of rawSegments) {
            const weight = Math.max((seg.end ?? 0) - (seg.start ?? 0), 0.001);
            totalWeight += weight;
            if (typeof seg.avg_logprob === 'number') avgLogprobSum += seg.avg_logprob * weight;
            if (typeof seg.no_speech_prob === 'number') noSpeechSum += seg.no_speech_prob * weight;
            if (typeof seg.compression_ratio === 'number') {
                maxCompression = Math.max(maxCompression, seg.compression_ratio);
            }
        }

        const segments = rawSegments
            .map(seg => ({
                start: Number(seg.start) || 0,
                end: Number(seg.end) || 0,
                text: String(seg.text || '').trim(),
            }))
            .filter(seg => seg.text.length > 0);

        return {
            language: parsed.language,
            languageProbability: parsed.languageProbability,
            avgLogprob: totalWeight > 0 ? avgLogprobSum / totalWeight : undefined,
            noSpeechProb: totalWeight > 0 ? noSpeechSum / totalWeight : undefined,
            compressionRatio: maxCompression > 0 ? maxCompression : undefined,
            segmentsCount: rawSegments.length,
            wordsCount: countTranscriptionWords(text),
            ...(segments.length ? { segments } : {}),
        };
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
