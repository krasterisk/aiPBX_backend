import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITranscriptionProvider, TranscriptionResult } from '../interfaces/operator-metrics.interface';
import axios from 'axios';
import * as FormData from 'form-data';

/**
 * External HTTP STT provider.
 * Sends audio to an external transcription service via HTTP multipart/form-data.
 *
 * Required env vars:
 *   STT_API_URL   — full URL of the transcription endpoint
 *   STT_API_TOKEN — Bearer token for Authorization header (optional)
 *
 * Expected response format (JSON):
 *   { text: string, duration?: number }
 * OR plain text string.
 */
@Injectable()
export class ExternalSttProvider implements ITranscriptionProvider {
    private readonly logger = new Logger(ExternalSttProvider.name);
    private readonly apiUrl: string;
    private readonly apiToken: string | undefined;

    constructor(private readonly configService: ConfigService) {
        this.apiUrl = this.configService.get<string>('STT_API_URL') || process.env.STT_API_URL;
        this.apiToken = this.configService.get<string>('STT_API_TOKEN') || process.env.STT_API_TOKEN;

        if (!this.apiUrl) {
            this.logger.warn('STT_API_URL is not set — external STT provider will fail at runtime');
        }
    }

    async transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult> {
        if (!this.apiUrl) {
            throw new HttpException(
                'External STT provider is not configured (STT_API_URL missing)',
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }

        this.logger.log(`[ExternalSTT] Sending "${filename}" (${buffer.length} bytes) to ${this.apiUrl}`);

        const form = new FormData();
        form.append('file', buffer, {
            filename,
            contentType: this.getMimeType(filename),
        });

        if (language && language !== 'auto') {
            form.append('language', language);
        }

        const headers: Record<string, string> = {
            ...form.getHeaders(),
        };

        if (this.apiToken) {
            headers['Authorization'] = `Bearer ${this.apiToken}`;
        }

        const response = await axios.post(this.apiUrl, form, {
            headers,
            timeout: 300_000, // 5 min max
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const data = response.data;

        // Support both JSON { text, duration } and plain string responses
        let text: string;
        let duration: number;

        if (typeof data === 'string') {
            text = data;
            duration = 0;
        } else if (typeof data === 'object') {
            text = data.text || data.transcript || data.result || '';
            duration = data.duration || data.duration_seconds || 0;
        } else {
            throw new HttpException(
                `External STT returned unexpected response format: ${typeof data}`,
                HttpStatus.BAD_GATEWAY,
            );
        }

        this.logger.log(`[ExternalSTT] Transcription complete: ${text.length} chars, duration: ${duration}s`);

        return { text, duration };
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
