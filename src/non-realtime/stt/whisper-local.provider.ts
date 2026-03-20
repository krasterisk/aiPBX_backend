import { Logger } from '@nestjs/common';
import { ISttProvider, SttResult } from '../interfaces/stt-provider.interface';
import axios from 'axios';
import FormData = require('form-data');

/**
 * Whisper Local STT Provider.
 *
 * Sends audio to local Whisper Docker container (onerahmet/openai-whisper-asr-webservice)
 * running on GPU VPS via HTTP multipart/form-data.
 *
 * Uses the same Whisper container that's already deployed for analytics.
 * Expected to work over internal Docker network (http://whisper:9000/asr).
 */
export class WhisperLocalProvider implements ISttProvider {
    readonly name = 'whisper-local';
    readonly isStreaming = false;
    private readonly logger = new Logger(WhisperLocalProvider.name);
    private readonly whisperUrl: string;

    constructor(whisperUrl?: string) {
        this.whisperUrl = whisperUrl
            || process.env.WHISPER_API_URL
            || 'http://whisper:9000/asr';
    }

    async transcribe(audioBuffer: Buffer, language?: string): Promise<SttResult> {
        this.logger.debug(`[Whisper] Transcribing ${audioBuffer.length} bytes, language: ${language || 'auto'}`);

        // Convert PCM16 16kHz mono to WAV format for Whisper
        const wavBuffer = this.pcm16ToWav(audioBuffer, 16000);

        const form = new FormData();
        form.append('audio_file', wavBuffer, {
            filename: 'speech.wav',
            contentType: 'audio/wav',
        });

        const params: Record<string, string> = {
            task: 'transcribe',
            output: 'json',
        };

        if (language && language !== 'auto') {
            params.language = language;
        }

        try {
            const response = await axios.post(this.whisperUrl, form, {
                headers: form.getHeaders(),
                params,
                responseType: 'json',
                timeout: 30_000, // 30s (short audio, should be fast on GPU)
            });

            let parsed = response.data;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch { /* plain text */ }
            }

            const text = typeof parsed === 'string' ? parsed : (parsed?.text || '');
            const duration = parsed?.duration || 0;

            this.logger.log(`[Whisper] Result: "${text}" (${duration}s)`);
            return { text: text.trim(), duration };

        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            this.logger.error(`[Whisper] Transcription failed: ${msg}`);
            return { text: '', duration: 0 };
        }
    }

    /**
     * Wrap raw PCM16 LE mono into a minimal WAV container.
     */
    private pcm16ToWav(pcm16: Buffer, sampleRate: number): Buffer {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcm16.length;
        const headerSize = 44;
        const fileSize = headerSize + dataSize - 8;

        const header = Buffer.alloc(headerSize);

        header.write('RIFF', 0);
        header.writeUInt32LE(fileSize, 4);
        header.write('WAVE', 8);
        header.write('fmt ', 12);
        header.writeUInt32LE(16, 16);           // fmt chunk size
        header.writeUInt16LE(1, 20);            // PCM format
        header.writeUInt16LE(numChannels, 22);
        header.writeUInt32LE(sampleRate, 24);
        header.writeUInt32LE(byteRate, 28);
        header.writeUInt16LE(blockAlign, 32);
        header.writeUInt16LE(bitsPerSample, 34);
        header.write('data', 36);
        header.writeUInt32LE(dataSize, 40);

        return Buffer.concat([header, pcm16]);
    }
}
