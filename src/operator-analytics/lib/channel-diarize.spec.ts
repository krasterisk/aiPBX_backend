import {
    billableStereoDuration,
    coalesceAdjacentTurns,
    combinedPlainText,
    diarizedTurnsToStorageJson,
    formatDiarizedTranscriptForLlm,
    formatStereoChannelsForLlm,
    isChannelDiarizationViable,
    isTimestampMergeReliable,
    labelSegmentsByChannelEnergy,
    maxChannelDuration,
    mergeChannelTranscripts,
    parseStereoChannelMap,
    parseStereoDiarizeMode,
    pcm16MonoRms,
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

function makeMonoWav(samples: number[], sampleRate = 8000): Buffer {
    const dataSize = samples.length * 2;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < samples.length; i++) {
        buf.writeInt16LE(samples[i], 44 + i * 2);
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

    describe('parseStereoDiarizeMode', () => {
        it('defaults to energy', () => {
            expect(parseStereoDiarizeMode()).toBe('energy');
            expect(parseStereoDiarizeMode('')).toBe('energy');
            expect(parseStereoDiarizeMode('ENERGY')).toBe('energy');
        });

        it('parses off and dual-stt aliases', () => {
            expect(parseStereoDiarizeMode('off')).toBe('off');
            expect(parseStereoDiarizeMode('0')).toBe('off');
            expect(parseStereoDiarizeMode('dual')).toBe('dual-stt');
            expect(parseStereoDiarizeMode('dual_stt')).toBe('dual-stt');
        });
    });

    describe('labelSegmentsByChannelEnergy', () => {
        it('assigns speaker by louder channel in each segment window', () => {
            const sr = 8000;
            // 0–1s left loud, 1–2s right loud
            const left = [
                ...Array.from({ length: sr }, () => 8000),
                ...Array.from({ length: sr }, () => 100),
            ];
            const right = [
                ...Array.from({ length: sr }, () => 100),
                ...Array.from({ length: sr }, () => 8000),
            ];
            const turns = labelSegmentsByChannelEnergy(
                [
                    { start: 0.1, end: 0.9, text: 'Hello' },
                    { start: 1.1, end: 1.9, text: 'Hi there' },
                ],
                makeMonoWav(left, sr),
                makeMonoWav(right, sr),
            );
            expect(turns.map(t => t.speaker)).toEqual(['operator', 'customer']);
            expect(turns.map(t => t.text)).toEqual(['Hello', 'Hi there']);
        });

        it('pcm16MonoRms is higher on louder window', () => {
            const loud = makeMonoWav(Array.from({ length: 8000 }, () => 10000));
            const quiet = makeMonoWav(Array.from({ length: 8000 }, () => 50));
            expect(pcm16MonoRms(loud, 0, 1)).toBeGreaterThan(pcm16MonoRms(quiet, 0, 1) * 10);
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
        it('merges timed segments by start and coalesces only short gaps', () => {
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

        it('keeps same-speaker turns separate when pause is long', () => {
            const turns = mergeChannelTranscripts(
                {
                    text: 'A B',
                    duration: 10,
                    segments: [
                        { start: 0, end: 1, text: 'A' },
                        { start: 5, end: 6, text: 'B' },
                    ],
                },
                {
                    text: 'mid',
                    duration: 10,
                    segments: [{ start: 2, end: 3, text: 'mid' }],
                },
            );
            expect(turns.map(t => `${t.speaker}:${t.text}`)).toEqual([
                'operator:A',
                'customer:mid',
                'operator:B',
            ]);
        });

        it('coalesces rapid same-speaker back-to-back segments', () => {
            const turns = mergeChannelTranscripts(
                {
                    text: 'Hello world',
                    duration: 3,
                    segments: [
                        { start: 0, end: 0.8, text: 'Hello' },
                        { start: 0.9, end: 1.5, text: 'world' },
                    ],
                },
                { text: '', duration: 3, segments: [] },
            );
            expect(turns).toEqual([
                expect.objectContaining({ speaker: 'operator', text: 'Hello world' }),
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
        it('coalesceAdjacentTurns merges only within gap', () => {
            expect(coalesceAdjacentTurns([
                { speaker: 'operator', text: 'A', start: 0, end: 1 },
                { speaker: 'operator', text: 'B', start: 1.2, end: 2 },
                { speaker: 'customer', text: 'C', start: 2.5, end: 3 },
            ], 0.75)).toEqual([
                { speaker: 'operator', text: 'A B', start: 0, end: 2 },
                { speaker: 'customer', text: 'C', start: 2.5, end: 3 },
            ]);

            expect(coalesceAdjacentTurns([
                { speaker: 'operator', text: 'A', start: 0, end: 1 },
                { speaker: 'operator', text: 'B', start: 3, end: 4 },
            ], 0.75)).toEqual([
                { speaker: 'operator', text: 'A', start: 0, end: 1 },
                { speaker: 'operator', text: 'B', start: 3, end: 4 },
            ]);
        });

        it('formats storage JSON and LLM transcript with timestamps', () => {
            const turns = [
                { speaker: 'operator' as const, text: 'Hi', start: 1.5, end: 2 },
                { speaker: 'customer' as const, text: 'Hello', start: 2.2, end: 3 },
            ];
            expect(JSON.parse(diarizedTurnsToStorageJson(turns))).toEqual([
                { speaker: 'operator', text: 'Hi', start: 1.5, end: 2 },
                { speaker: 'customer', text: 'Hello', start: 2.2, end: 3 },
            ]);
            expect(formatDiarizedTranscriptForLlm(turns)).toBe(
                '[0:01] operator: Hi\n[0:02] customer: Hello',
            );
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

        it('formatStereoChannelsForLlm locks speakers by channel', () => {
            const text = formatStereoChannelsForLlm(
                { text: 'Здравствуйте', duration: 1 },
                { text: 'Добрый день', duration: 1 },
            );
            expect(text).toContain('=== operator channel ===');
            expect(text).toContain('Здравствуйте');
            expect(text).toContain('=== customer channel ===');
            expect(text).toContain('Добрый день');
            expect(text).toContain('ground truth');
        });

        it('isTimestampMergeReliable rejects full-channel blobs', () => {
            const left = { text: 'A B C', duration: 5 };
            const right = { text: 'X Y', duration: 5 };
            const blobTurns = [
                { speaker: 'operator' as const, text: 'A B C' },
                { speaker: 'customer' as const, text: 'X Y' },
            ];
            expect(isTimestampMergeReliable(blobTurns, left, right)).toBe(false);

            const timed = {
                text: 'A B',
                duration: 5,
                segments: [
                    { start: 0, end: 1, text: 'A' },
                    { start: 3, end: 4, text: 'B' },
                ],
            };
            const rightTimed = {
                text: 'X',
                duration: 5,
                segments: [{ start: 1.5, end: 2, text: 'X' }],
            };
            const turns = mergeChannelTranscripts(timed, rightTimed);
            expect(isTimestampMergeReliable(turns, timed, rightTimed)).toBe(true);
        });
    });
});
