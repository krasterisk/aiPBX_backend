import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ITranscriptionProvider, TranscriptionResult } from '../interfaces/operator-metrics.interface';
import { Readable } from 'stream';

@Injectable()
export class OpenAiTranscriptionProvider implements ITranscriptionProvider {
    private readonly logger = new Logger(OpenAiTranscriptionProvider.name);
    private readonly openAiClient: OpenAI;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
        this.openAiClient = new OpenAI({ apiKey });
    }

    async transcribe(buffer: Buffer, filename: string, language?: string): Promise<TranscriptionResult> {
        this.logger.log(`Transcribing file: ${filename}, size: ${buffer.length} bytes, language: ${language || 'auto'}`);

        // Create a File-like object from buffer for the OpenAI SDK
        const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        const file = new File([arrayBuf], filename, { type: this.getMimeType(filename) });

        const params: any = {
            file,
            model: 'whisper-1',
            response_format: 'verbose_json',
        };

        if (language && language !== 'auto') {
            params.language = language;
        }

        const response = await this.openAiClient.audio.transcriptions.create(params);

        const text = typeof response === 'string' ? response : (response as any).text || '';
        const duration = (response as any).duration || 0;

        this.logger.log(`Transcription complete: ${text.length} chars, duration: ${duration}s`);

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
