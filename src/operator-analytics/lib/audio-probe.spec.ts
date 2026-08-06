import {
    detectFakeStereoWav,
    probeAudio,
    probeWavHeader,
} from './audio-probe';

/** Build a minimal PCM16 WAV buffer (interleaved if stereo). */
function makeWav(opts: {
    channels: 1 | 2;
    sampleRate?: number;
    samples: number[]; // interleaved for stereo: L0,R0,L1,R1,...
}): Buffer {
    const sampleRate = opts.sampleRate ?? 8000;
    const channels = opts.channels;
    const dataSize = opts.samples.length * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * channels * 2, 28);
    buf.writeUInt16LE(channels * 2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < opts.samples.length; i++) {
        buf.writeInt16LE(opts.samples[i], 44 + i * 2);
    }
    return buf;
}

describe('audio-probe', () => {
    it('probeWavHeader reads mono WAV', () => {
        const samples = Array.from({ length: 200 }, (_, i) => Math.round(Math.sin(i / 10) * 1000));
        const wav = makeWav({ channels: 1, samples });
        const header = probeWavHeader(wav);
        expect(header).toMatchObject({ channels: 1, sampleRate: 8000, bitsPerSample: 16 });
    });

    it('probeAudio marks mono as not stereo candidate', async () => {
        const samples = Array.from({ length: 200 }, (_, i) => Math.round(Math.sin(i / 10) * 1000));
        const wav = makeWav({ channels: 1, samples });
        const result = await probeAudio(wav, 'call.wav');
        expect(result.channels).toBe(1);
        expect(result.isStereoCandidate).toBe(false);
        expect(result.probeSource).toBe('wav-header');
    });

    it('probeAudio marks true dual-channel stereo as candidate', async () => {
        // Independent L/R signals → low correlation
        const samples: number[] = [];
        for (let i = 0; i < 500; i++) {
            samples.push(Math.round(Math.sin(i / 7) * 8000)); // L
            samples.push(Math.round(Math.cos(i / 3) * 8000)); // R
        }
        const wav = makeWav({ channels: 2, samples });
        const result = await probeAudio(wav, 'stereo.wav');
        expect(result.channels).toBe(2);
        expect(result.isStereoCandidate).toBe(true);
        expect(result.fakeStereo).toBe(false);
    });

    it('detectFakeStereoWav flags identical L/R as fake stereo', () => {
        const samples: number[] = [];
        for (let i = 0; i < 500; i++) {
            const s = Math.round(Math.sin(i / 5) * 5000);
            samples.push(s, s);
        }
        const wav = makeWav({ channels: 2, samples });
        const header = probeWavHeader(wav)!;
        expect(detectFakeStereoWav(wav, header)).toBe(true);
    });

    it('probeAudio falls back safely for unknown binary', async () => {
        const result = await probeAudio(Buffer.from('not-audio'), 'file.bin');
        expect(result.isStereoCandidate).toBe(false);
        expect(result.probeSource).toBe('none');
        expect(result.channels).toBe(1);
    });
});
