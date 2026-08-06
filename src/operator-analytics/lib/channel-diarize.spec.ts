import {
    billableStereoDuration,
    coalesceAdjacentTurns,
    combinedPlainText,
    diarizedTurnsToStorageJson,
    formatDiarizedTranscriptForLlm,
    isChannelDiarizationViable,
    maxChannelDuration,
    mergeChannelTranscripts,
    parseStereoChannelMap,
    splitWavPcmStereo,
} from './channel-diarize';
import { probeWavHeader } from './audio-probe';

function makeStereoWav(leftSamples: number[], rightSamples: number[], sampleRate = 8000): Buffer {
    const n = Math.min(leftSamples.length, rightSamples.length);
    const dataSize = n * 4;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(2, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 4, 28);
    buf.writeUInt16LE(4, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < n; i++) {
        buf.writeInt16LE(leftSamples[i], 44 + i * 4);
        buf.writeInt16LE(rightSamples[i], 44 + i * 4 + 2);
    }
    return buf;
}

describe('channel-diarize', () => {
    describe('parseStereoChannelMap', () => {
        it('defaults to left=operator, right=customer', () => {
            expect(parseStereoChannelMap()).toEqual({ left: 'operator', right: 'customer' });
            expect(parseStereoChannelMap('')).toEqual({ left: 'operator', right: 'customer' });
        });

        it('parses role:side form', () => {
            expect(parseStereoChannelMap('operator:right,customer:left')).toEqual({
                left: 'customer',
                right: 'operator',
            });
        });

        it('parses side=role form', () => {
            expect(parseStereoChannelMap('left=customer,right=operator')).toEqual({
                left: 'customer',
                right: 'operator',
            });
        });
    });

    describe('splitWavPcmStereo', () => {
        it('splits interleaved PCM into two mono WAVs', () => {
            const left = Array.from({ length: 100 }, (_, i) => i * 10);
            const right = Array.from({ length: 100 }, (_, i) => -i * 10);
            const stereo = makeStereoWav(left, right);
            const split = splitWavPcmStereo(stereo);
            expect(split).not.toBeNull();
            expect(split!.method).toBe('wav-pcm');

            const leftHeader = probeWavHeader(split!.left)!;
            const rightHeader = probeWavHeader(split!.right)!;
            expect(leftHeader.channels).toBe(1);
            expect(rightHeader.channels).toBe(1);
            expect(split!.left.readInt16LE(44)).toBe(0);
            expect(split!.right.readInt16LE(44)).toBe(0);
            expect(split!.left.readInt16LE(46)).toBe(10);
            expect(split!.right.readInt16LE(46)).toBe(-10);
        });

        it('returns null for mono WAV', () => {
            const mono = makeStereoWav([1, 2, 3], [1, 2, 3]);
            // Force mono header
            mono.writeUInt16LE(1, 22);
            expect(splitWavPcmStereo(mono)).toBeNull();
        });
    });

    describe('mergeChannelTranscripts', () => {
        it('merges timed segments by start and coalesces adjacent speakers', () => {
            const turns = mergeChannelTranscripts(
                {
                    text: 'Hello there',
                    duration: 5,
                    segments: [
                        { start: 0, end: 1, text: 'Hello' },
                        { start: 3, end: 4, text: 'there' },
                    ],
                },
                {
                    text: 'Hi thanks',
                    duration: 5,
                    segments: [
                        { start: 1.5, end: 2.5, text: 'Hi' },
                        { start: 4.5, end: 5, text: 'thanks' },
                    ],
                },
            );
            expect(turns.map(t => `${t.speaker}:${t.text}`)).toEqual([
                'operator:Hello',
                'customer:Hi',
                'operator:there',
                'customer:thanks',
            ]);
        });

        it('falls back to whole-channel turns without segments', () => {
            const turns = mergeChannelTranscripts(
                { text: 'Operator line', duration: 3 },
                { text: 'Customer line', duration: 3 },
            );
            expect(turns).toEqual([
                expect.objectContaining({ speaker: 'operator', text: 'Operator line' }),
                expect.objectContaining({ speaker: 'customer', text: 'Customer line' }),
            ]);
        });

        it('respects inverted channel map', () => {
            const turns = mergeChannelTranscripts(
                { text: 'Actually customer', duration: 1 },
                { text: 'Actually operator', duration: 1 },
                { left: 'customer', right: 'operator' },
            );
            expect(turns[0].speaker).toBe('customer');
            expect(turns[1].speaker).toBe('operator');
        });
    });

    describe('helpers', () => {
        it('coalesceAdjacentTurns merges same-speaker neighbors', () => {
            expect(coalesceAdjacentTurns([
                { speaker: 'operator', text: 'A' },
                { speaker: 'operator', text: 'B' },
                { speaker: 'customer', text: 'C' },
            ])).toEqual([
                { speaker: 'operator', text: 'A B' },
                { speaker: 'customer', text: 'C' },
            ]);
        });

        it('formats storage JSON and LLM transcript', () => {
            const turns = [
                { speaker: 'operator' as const, text: 'Hi' },
                { speaker: 'customer' as const, text: 'Hello' },
            ];
            expect(JSON.parse(diarizedTurnsToStorageJson(turns))).toEqual([
                { speaker: 'operator', text: 'Hi' },
                { speaker: 'customer', text: 'Hello' },
            ]);
            expect(formatDiarizedTranscriptForLlm(turns)).toBe('operator: Hi\ncustomer: Hello');
        });

        it('viability and duration helpers', () => {
            expect(isChannelDiarizationViable(
                { text: '', duration: 1 },
                { text: '', duration: 1 },
            )).toBe(false);
            expect(isChannelDiarizationViable(
                { text: 'x', duration: 1 },
                { text: '', duration: 1 },
            )).toBe(true);
            expect(combinedPlainText(
                { text: 'a', duration: 1 },
                { text: 'b', duration: 1 },
            )).toBe('a\nb');
            expect(billableStereoDuration(
                { text: '', duration: 10 },
                { text: '', duration: 12 },
            )).toBe(22);
            expect(maxChannelDuration(
                { text: '', duration: 10 },
                { text: '', duration: 12 },
            )).toBe(12);
        });
    });
});
