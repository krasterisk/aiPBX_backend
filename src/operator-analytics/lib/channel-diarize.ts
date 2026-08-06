import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { probeWavHeader } from './audio-probe';
import { TranscriptionResult, TranscriptionSegment } from '../interfaces/operator-metrics.interface';

const execFileAsync = promisify(execFile);

export type DiarizationSpeaker = 'operator' | 'customer';
export type StereoSide = 'left' | 'right';
export type DiarizationSource = 'channel' | 'llm';

export interface StereoChannelMap {
    left: DiarizationSpeaker;
    right: DiarizationSpeaker;
}

export interface DiarizedTurn {
    speaker: DiarizationSpeaker;
    text: string;
    start?: number;
    end?: number;
}

export interface ChannelSplitResult {
    left: Buffer;
    right: Buffer;
    leftFilename: string;
    rightFilename: string;
    method: 'ffmpeg' | 'wav-pcm';
}

const DEFAULT_MAP: StereoChannelMap = { left: 'operator', right: 'customer' };

/**
 * Parse OPERATOR_STEREO_CHANNEL_MAP env.
 * Accepted forms:
 *   operator:left,customer:right  (default)
 *   left=operator,right=customer
 */
export function parseStereoChannelMap(raw?: string | null): StereoChannelMap {
    if (!raw?.trim()) return { ...DEFAULT_MAP };

    // Prefer explicit side=role / role=side pairs
    const sideRole: Partial<Record<StereoSide, DiarizationSpeaker>> = {};
    for (const part of raw.split(/[,;]/)) {
        const m = part.trim().match(/^(left|right|operator|customer)\s*[:=]\s*(left|right|operator|customer)$/i);
        if (!m) continue;
        const a = m[1].toLowerCase();
        const b = m[2].toLowerCase();
        if ((a === 'left' || a === 'right') && (b === 'operator' || b === 'customer')) {
            sideRole[a as StereoSide] = b as DiarizationSpeaker;
        } else if ((a === 'operator' || a === 'customer') && (b === 'left' || b === 'right')) {
            sideRole[b as StereoSide] = a as DiarizationSpeaker;
        }
    }

    if (sideRole.left && sideRole.right && sideRole.left !== sideRole.right) {
        return { left: sideRole.left, right: sideRole.right };
    }

    // Fallback: if only one side parsed uniquely, invert the other
    if (sideRole.left && !sideRole.right) {
        return {
            left: sideRole.left,
            right: sideRole.left === 'operator' ? 'customer' : 'operator',
        };
    }
    if (sideRole.right && !sideRole.left) {
        return {
            right: sideRole.right,
            left: sideRole.right === 'operator' ? 'customer' : 'operator',
        };
    }

    return { ...DEFAULT_MAP };
}

/**
 * Split a stereo audio buffer into two mono WAV buffers (left / right).
 * Prefers ffmpeg; falls back to interleaved PCM16 WAV split when possible.
 */
export async function splitStereoChannels(
    buffer: Buffer,
    filename: string,
): Promise<ChannelSplitResult> {
    try {
        return await splitWithFfmpeg(buffer, filename);
    } catch {
        const wavSplit = splitWavPcmStereo(buffer);
        if (wavSplit) return wavSplit;
        throw new Error('Stereo split failed: ffmpeg unavailable and WAV PCM fallback not applicable');
    }
}

async function splitWithFfmpeg(buffer: Buffer, filename: string): Promise<ChannelSplitResult> {
    const ext = (filename.split('.').pop() || 'bin').toLowerCase();
    const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'bin';
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oa-split-'));
    const inputPath = path.join(tmpDir, `input.${safeExt}`);
    const leftPath = path.join(tmpDir, 'left.wav');
    const rightPath = path.join(tmpDir, 'right.wav');

    try {
        await fs.promises.writeFile(inputPath, buffer);
        await execFileAsync('ffmpeg', [
            '-y',
            '-i', inputPath,
            '-filter_complex',
            'channelsplit=channel_layout=stereo[L][R]',
            '-map', '[L]', leftPath,
            '-map', '[R]', rightPath,
        ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });

        const [left, right] = await Promise.all([
            fs.promises.readFile(leftPath),
            fs.promises.readFile(rightPath),
        ]);
        return {
            left,
            right,
            leftFilename: 'left.wav',
            rightFilename: 'right.wav',
            method: 'ffmpeg',
        };
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
}

/** Interleaved PCM16 stereo WAV → two mono WAV buffers. */
export function splitWavPcmStereo(buffer: Buffer): ChannelSplitResult | null {
    const header = probeWavHeader(buffer);
    if (!header || header.channels !== 2 || header.bitsPerSample !== 16) return null;

    const frameCount = Math.floor(header.dataSize / 4);
    const leftPcm = Buffer.alloc(frameCount * 2);
    const rightPcm = Buffer.alloc(frameCount * 2);

    for (let i = 0; i < frameCount; i++) {
        const off = header.dataOffset + i * 4;
        leftPcm.writeInt16LE(buffer.readInt16LE(off), i * 2);
        rightPcm.writeInt16LE(buffer.readInt16LE(off + 2), i * 2);
    }

    return {
        left: wrapPcm16MonoWav(leftPcm, header.sampleRate),
        right: wrapPcm16MonoWav(rightPcm, header.sampleRate),
        leftFilename: 'left.wav',
        rightFilename: 'right.wav',
        method: 'wav-pcm',
    };
}

function wrapPcm16MonoWav(pcm: Buffer, sampleRate: number): Buffer {
    const dataSize = pcm.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // PCM fmt chunk size
    header.writeUInt16LE(1, 20); // audio format = PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
}

/**
 * Merge per-channel STT results into ordered speaker turns.
 * Uses segment timestamps when available; otherwise emits one turn per channel
 * ordered operator-then-customer (or by map) without timestamps.
 */
export function mergeChannelTranscripts(
    left: TranscriptionResult,
    right: TranscriptionResult,
    channelMap: StereoChannelMap = DEFAULT_MAP,
): DiarizedTurn[] {
    const leftSegs = normalizeSegments(left);
    const rightSegs = normalizeSegments(right);

    const timed: DiarizedTurn[] = [
        ...leftSegs.map(s => ({ speaker: channelMap.left, text: s.text, start: s.start, end: s.end })),
        ...rightSegs.map(s => ({ speaker: channelMap.right, text: s.text, start: s.start, end: s.end })),
    ].filter(t => t.text.trim().length > 0);

    if (timed.length === 0) {
        return [];
    }

    const hasTimestamps = timed.some(t => t.start != null);
    if (hasTimestamps) {
        timed.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    }

    return coalesceAdjacentTurns(timed);
}

function normalizeSegments(result: TranscriptionResult): TranscriptionSegment[] {
    if (Array.isArray(result.segments) && result.segments.length > 0) {
        return result.segments
            .map(s => ({
                start: Number(s.start) || 0,
                end: Number(s.end) || 0,
                text: String(s.text || '').trim(),
            }))
            .filter(s => s.text.length > 0);
    }
    const text = (result.text || '').trim();
    if (!text) return [];
    return [{ start: 0, end: result.duration || 0, text }];
}

export function coalesceAdjacentTurns(turns: DiarizedTurn[]): DiarizedTurn[] {
    const out: DiarizedTurn[] = [];
    for (const turn of turns) {
        const text = turn.text.trim();
        if (!text) continue;
        const prev = out[out.length - 1];
        if (prev && prev.speaker === turn.speaker) {
            prev.text = `${prev.text} ${text}`.replace(/\s+/g, ' ').trim();
            if (turn.end != null) prev.end = turn.end;
        } else {
            out.push({
                speaker: turn.speaker,
                text,
                start: turn.start,
                end: turn.end,
            });
        }
    }
    return out;
}

/** Canonical storage / UI shape (no timestamps — matches existing LLM output). */
export function diarizedTurnsToStorageJson(turns: DiarizedTurn[]): string {
    return JSON.stringify(turns.map(t => ({ speaker: t.speaker, text: t.text })));
}

/** Human-readable labeled transcript for the analysis LLM. */
export function formatDiarizedTranscriptForLlm(turns: DiarizedTurn[]): string {
    return turns.map(t => `${t.speaker}: ${t.text}`).join('\n');
}

/** Combined plain text for quality / keyword helpers. */
export function combinedPlainText(left: TranscriptionResult, right: TranscriptionResult): string {
    return [left.text, right.text].map(t => (t || '').trim()).filter(Boolean).join('\n');
}

/**
 * Channel diarization is viable when at least one side has speech.
 * Both empty → caller should fall back to mono/LLM path.
 */
export function isChannelDiarizationViable(left: TranscriptionResult, right: TranscriptionResult): boolean {
    const leftWords = (left.text || '').trim().length;
    const rightWords = (right.text || '').trim().length;
    return leftWords > 0 || rightWords > 0;
}

export function billableStereoDuration(left: TranscriptionResult, right: TranscriptionResult): number {
    const l = Number(left.duration) || 0;
    const r = Number(right.duration) || 0;
    // Two STT calls — bill wall durations summed for paid providers.
    return l + r;
}

export function maxChannelDuration(left: TranscriptionResult, right: TranscriptionResult): number {
    return Math.max(Number(left.duration) || 0, Number(right.duration) || 0);
}
