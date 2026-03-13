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
            output: 'json',
        };

        if (language && language !== 'auto') {
            params.language = language;
        }

        const headers: Record<string, string> = {
            ...form.getHeaders(),
        };

        let response;
        try {
            response = await axios.post(this.whisperUrl, form, {
                headers,
                params,
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

        const data = response.data;

        let text: string;
        let duration = 0;

        if (typeof data === 'string') {
            text = data;
        } else if (typeof data === 'object') {
            // Whisper ASR webservice returns { text: "..." } for output=json
            text = data.text || '';
            duration = data.duration || data.duration_seconds || 0;
        } else {
            throw new HttpException(
                `Whisper returned unexpected response format: ${typeof data}`,
                HttpStatus.BAD_GATEWAY,
            );
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
