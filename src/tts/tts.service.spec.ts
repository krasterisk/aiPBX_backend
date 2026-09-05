import { HttpException, HttpStatus } from '@nestjs/common';
import { TtsService } from './tts.service';

function pcmSine(sampleRate: number, durationSec: number): Buffer {
    const samples = Math.floor(sampleRate * durationSec);
    const buf = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        buf.writeInt16LE(Math.round(Math.sin(i / 8) * 1000), i * 2);
    }
    return buf;
}

function asyncChunks(buffer: Buffer, chunkBytes = 4): AsyncIterable<Buffer> {
    return {
        async *[Symbol.asyncIterator]() {
            for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
                yield buffer.subarray(offset, Math.min(offset + chunkBytes, buffer.length));
            }
        },
    };
}

describe('TtsService', () => {
    const sampleRate = 24000;
    const pcm = pcmSine(sampleRate, 0.1);

    let synthesize: jest.Mock;
    let healthCheck: jest.Mock;
    let listVoices: jest.Mock;
    let service: TtsService;

    beforeEach(() => {
        synthesize = jest.fn().mockReturnValue(asyncChunks(pcm));
        healthCheck = jest.fn().mockResolvedValue({ status: 'ok', url: 'http://omnivoice-tts:9002/tts' });
        listVoices = jest.fn().mockResolvedValue({
            available_voices: ['clone.wav'],
            native_sample_rate: 24000,
        });
        service = new TtsService({
            synthesize,
            healthCheck,
            listVoices,
            outputSampleRate: sampleRate,
        } as never);
    });

    it('wraps OmniVoice PCM into a WAV file by default', async () => {
        const result = await service.synthesize({ text: 'Привет' });

        expect(result.contentType).toBe('audio/wav');
        expect(result.sampleRate).toBe(sampleRate);
        expect(result.audio.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(result.audio.subarray(8, 12).toString('ascii')).toBe('WAVE');
        expect(result.audio.readUInt32LE(24)).toBe(sampleRate);
        expect(result.audio.readUInt32LE(40)).toBe(pcm.length);
        expect(result.audio.subarray(44)).toEqual(pcm);
        expect(result.durationSeconds).toBeCloseTo(0.1, 3);
        expect(synthesize).toHaveBeenCalledWith(
            'Привет',
            expect.objectContaining({ voice: 'default', language: 'ru', sampleRate }),
        );
    });

    it('returns raw PCM when format=pcm', async () => {
        const result = await service.synthesize({ text: 'Hi', format: 'pcm' });

        expect(result.contentType).toBe('audio/pcm');
        expect(result.audio).toEqual(pcm);
    });

    it('forwards voice, language and sampleRate to OmniVoice', async () => {
        await service.synthesize({
            text: 'Hello',
            voice: 'clone.wav',
            language: 'en',
            sampleRate: 16000,
            format: 'pcm',
        });

        expect(synthesize).toHaveBeenCalledWith('Hello', {
            voice: 'clone.wav',
            language: 'en',
            sampleRate: 16000,
        });
    });

    it('rejects empty text', async () => {
        await expect(service.synthesize({ text: '   ' })).rejects.toMatchObject({
            status: HttpStatus.BAD_REQUEST,
        });
        expect(synthesize).not.toHaveBeenCalled();
    });

    it('rejects text longer than 4000 characters', async () => {
        await expect(service.synthesize({ text: 'я'.repeat(4001) })).rejects.toBeInstanceOf(HttpException);
        expect(synthesize).not.toHaveBeenCalled();
    });

    it('maps OmniVoice errors to 502', async () => {
        synthesize.mockImplementation(() => {
            throw new Error('ECONNREFUSED');
        });

        await expect(service.synthesize({ text: 'Привет' })).rejects.toMatchObject({
            status: HttpStatus.BAD_GATEWAY,
        });
    });

    it('healthCheck proxies OmniVoice', async () => {
        await expect(service.healthCheck()).resolves.toEqual({
            status: 'ok',
            url: 'http://omnivoice-tts:9002/tts',
        });
    });

    it('listVoices proxies OmniVoice and maps failures to 502', async () => {
        await expect(service.listVoices()).resolves.toEqual({
            available_voices: ['clone.wav'],
            native_sample_rate: 24000,
        });

        listVoices.mockRejectedValue(new Error('down'));
        await expect(service.listVoices()).rejects.toMatchObject({
            status: HttpStatus.BAD_GATEWAY,
        });
    });
});
