import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { OmniVoiceTtsProvider } from '../non-realtime/tts/omnivoice-tts.provider';
import { SynthesizeTtsDto, TTS_DEFAULT_SAMPLE_RATE, TTS_MAX_TEXT_LENGTH } from './dto/synthesize-tts.dto';

export interface TtsSynthesizeResult {
    audio: Buffer;
    contentType: 'audio/wav' | 'audio/pcm';
    sampleRate: number;
    durationSeconds: number;
}

@Injectable()
export class TtsService {
    constructor(private readonly omniVoice: OmniVoiceTtsProvider) {}

    async synthesize(dto: SynthesizeTtsDto): Promise<TtsSynthesizeResult> {
        const text = dto.text?.trim() ?? '';
        if (!text) {
            throw new HttpException('text is required', HttpStatus.BAD_REQUEST);
        }
        if (text.length > TTS_MAX_TEXT_LENGTH) {
            throw new HttpException(
                `text exceeds ${TTS_MAX_TEXT_LENGTH} characters`,
                HttpStatus.BAD_REQUEST,
            );
        }

        const sampleRate = dto.sampleRate ?? TTS_DEFAULT_SAMPLE_RATE;
        const voice = dto.voice || 'default';
        const language = dto.language || 'ru';
        const format = dto.format ?? 'wav';

        let pcm: Buffer;
        try {
            const chunks: Buffer[] = [];
            for await (const chunk of this.omniVoice.synthesize(text, {
                voice,
                language,
                sampleRate,
            })) {
                chunks.push(chunk);
            }
            pcm = Buffer.concat(chunks);
        } catch {
            throw new HttpException('TTS synthesis failed', HttpStatus.BAD_GATEWAY);
        }

        const durationSeconds = pcm.length / 2 / sampleRate;

        if (format === 'pcm') {
            return { audio: pcm, contentType: 'audio/pcm', sampleRate, durationSeconds };
        }

        return {
            audio: wrapPcm16LeWav(pcm, sampleRate),
            contentType: 'audio/wav',
            sampleRate,
            durationSeconds,
        };
    }

    async healthCheck() {
        return this.omniVoice.healthCheck();
    }

    async listVoices() {
        try {
            return await this.omniVoice.listVoices();
        } catch {
            throw new HttpException('OmniVoice TTS is unavailable', HttpStatus.BAD_GATEWAY);
        }
    }
}

/** PCM16 LE mono → 44-byte WAV header + payload */
export function wrapPcm16LeWav(pcm: Buffer, sampleRate: number): Buffer {
    const header = Buffer.alloc(44);
    const dataSize = pcm.length;
    const byteRate = sampleRate * 2;
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
}
