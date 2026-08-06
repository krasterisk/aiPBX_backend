import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export type AudioProbeSource = 'wav-header' | 'ffprobe' | 'none';

export interface AudioProbeResult {
    channels: number;
    format: string;
    sampleRate?: number;
    bitsPerSample?: number;
    /** True when channels === 2 and (optional) not detected as fake stereo. */
    isStereoCandidate: boolean;
    probeSource: AudioProbeSource;
    fakeStereo?: boolean;
}

const FAKE_STEREO_CORRELATION = 0.95;

/**
 * Probe channel count / format of an audio buffer.
 * WAV is parsed from the header; other formats use ffprobe when available.
 * On failure returns mono-safe defaults (isStereoCandidate=false).
 */
export async function probeAudio(buffer: Buffer, filename: string): Promise<AudioProbeResult> {
    const ext = (filename.split('.').pop() || '').toLowerCase();

    if (ext === 'wav' || looksLikeWav(buffer)) {
        const wav = probeWavHeader(buffer);
        if (wav) {
            if (wav.channels === 2 && wav.bitsPerSample === 16) {
                const fake = detectFakeStereoWav(buffer, wav);
                if (fake != null) {
                    return {
                        ...wav,
                        format: 'wav',
                        fakeStereo: fake,
                        isStereoCandidate: !fake,
                        probeSource: 'wav-header',
                    };
                }
            }
            return {
                ...wav,
                format: 'wav',
                isStereoCandidate: wav.channels === 2,
                probeSource: 'wav-header',
            };
        }
    }

    const probed = await probeWithFfprobe(buffer, filename, ext);
    if (probed) {
        return probed;
    }

    return {
        channels: 1,
        format: ext || 'unknown',
        isStereoCandidate: false,
        probeSource: 'none',
    };
}

function looksLikeWav(buffer: Buffer): boolean {
    return buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WAVE';
}

export function probeWavHeader(buffer: Buffer): {
    channels: number;
    sampleRate: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
} | null {
    if (buffer.length < 44) return null;
    if (!looksLikeWav(buffer)) return null;

    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    if (!channels || !sampleRate || !bitsPerSample) return null;

    let dataOffset = 44;
    let dataSize = 0;
    for (let i = 12; i < Math.min(buffer.length - 8, 512); ) {
        const chunkId = buffer.toString('ascii', i, i + 4);
        const chunkSize = buffer.readUInt32LE(i + 4);
        if (chunkId === 'data') {
            dataOffset = i + 8;
            dataSize = chunkSize;
            break;
        }
        i += 8 + chunkSize + (chunkSize % 2);
    }
    if (!dataSize) {
        dataSize = Math.max(0, buffer.length - dataOffset);
    }

    return { channels, sampleRate, bitsPerSample, dataOffset, dataSize };
}

/**
 * Heuristic: near-identical L/R PCM → downmixed "fake" stereo, not dual-channel.
 * Returns null when the buffer cannot be analysed (non-PCM16 / too short).
 */
export function detectFakeStereoWav(
    buffer: Buffer,
    header: { channels: number; bitsPerSample: number; dataOffset: number; dataSize: number },
): boolean | null {
    if (header.channels !== 2 || header.bitsPerSample !== 16) return null;

    const bytesPerFrame = 4; // 2 ch × 16-bit
    const totalFrames = Math.floor(header.dataSize / bytesPerFrame);
    if (totalFrames < 100) return null;

    // Subsample up to ~4000 frames for speed
    const step = Math.max(1, Math.floor(totalFrames / 4000));
    let n = 0;
    let sumL = 0;
    let sumR = 0;
    let sumLL = 0;
    let sumRR = 0;
    let sumLR = 0;

    for (let frame = 0; frame < totalFrames; frame += step) {
        const off = header.dataOffset + frame * bytesPerFrame;
        if (off + 4 > buffer.length) break;
        const l = buffer.readInt16LE(off);
        const r = buffer.readInt16LE(off + 2);
        sumL += l;
        sumR += r;
        sumLL += l * l;
        sumRR += r * r;
        sumLR += l * r;
        n += 1;
    }

    if (n < 50) return null;

    const meanL = sumL / n;
    const meanR = sumR / n;
    const varL = sumLL / n - meanL * meanL;
    const varR = sumRR / n - meanR * meanR;
    const cov = sumLR / n - meanL * meanR;
    const denom = Math.sqrt(Math.max(varL, 0) * Math.max(varR, 0));
    if (denom < 1e-6) {
        // Both silent / constant → treat as not useful stereo
        return true;
    }
    const correlation = cov / denom;
    return correlation >= FAKE_STEREO_CORRELATION;
}

async function probeWithFfprobe(
    buffer: Buffer,
    filename: string,
    ext: string,
): Promise<AudioProbeResult | null> {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oa-probe-'));
    const safeExt = ext && /^[a-z0-9]+$/i.test(ext) ? ext : 'bin';
    const tmpFile = path.join(tmpDir, `audio.${safeExt}`);
    try {
        await fs.promises.writeFile(tmpFile, buffer);
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-select_streams', 'a:0',
            tmpFile,
        ], { timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });

        const parsed = JSON.parse(stdout);
        const stream = Array.isArray(parsed?.streams) ? parsed.streams[0] : null;
        if (!stream) return null;

        const channels = Number(stream.channels) || 1;
        const sampleRate = stream.sample_rate ? Number(stream.sample_rate) : undefined;
        return {
            channels,
            format: stream.codec_name || ext || 'unknown',
            sampleRate: Number.isFinite(sampleRate) ? sampleRate : undefined,
            isStereoCandidate: channels === 2,
            probeSource: 'ffprobe',
        };
    } catch {
        return null;
    } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
}
