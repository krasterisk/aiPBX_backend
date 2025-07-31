import {Injectable, Logger} from '@nestjs/common';
import * as wav from 'wav';
import { alaw } from 'x-law';
import * as fs from "fs";

export interface ResampleOptions {
    bitDepth?: number;
    numChannels?: number;
}

interface WriteToWavOptions {
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
}

@Injectable()
export class AudioService {

    private logger = new Logger(AudioService.name);

    public createWavWriteStream(filePath: string, options: WriteToWavOptions = {}): wav.FileWriter {
        const { sampleRate = 8000, channels = 1, bitDepth = 16 } = options;

        return new wav.FileWriter(filePath, {
            sampleRate,
            channels,
            bitDepth,
        });
    }

    public writeChunkToStream(stream: wav.FileWriter, alawBuffer: Buffer): void {
        try {
            const pcmArray = alaw.decode(alawBuffer);
            const pcmBuffer = Buffer.from(pcmArray.buffer);
            stream.write(pcmBuffer);
        } catch (err) {
            this.logger.error('Failed to write audio chunk to stream:', err);
        }
    }

    //mix in\out wav files
    public async mixWavFiles(inputPath1: string, inputPath2: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const reader1 = new wav.Reader();
            const reader2 = new wav.Reader();

            const fileStream1 = fs.createReadStream(inputPath1);
            const fileStream2 = fs.createReadStream(inputPath2);

            let headerInfo: wav.Format;
            let buffer1: Buffer[] = [];
            let buffer2: Buffer[] = [];

            reader1.on('format', (format) => {
                headerInfo = format;
            });

            reader1.on('data', (chunk) => {
                buffer1.push(chunk);
            });

            reader2.on('data', (chunk) => {
                buffer2.push(chunk);
            });

            let done = 0;
            const finish = () => {
                if (++done < 2) return;

                const audio1 = Buffer.concat(buffer1);
                const audio2 = Buffer.concat(buffer2);

                const minLength = Math.min(audio1.length, audio2.length);
                const interleaved = Buffer.alloc(minLength * 2);

                for (let i = 0; i < minLength; i += 2) {
                    // Left channel (audio1)
                    interleaved.writeInt16LE(audio1.readInt16LE(i), i * 2);
                    // Right channel (audio2)
                    interleaved.writeInt16LE(audio2.readInt16LE(i), i * 2 + 2);
                }

                const writer = new wav.FileWriter(outputPath, {
                    channels: 2,
                    sampleRate: headerInfo.sampleRate,
                    bitDepth: 16
                });

                writer.write(interleaved);
                writer.end(() => {
                    this.logger.log(`Mixed file written to ${outputPath}`);
                    resolve();
                });
            };

            reader1.on('end', finish);
            reader2.on('end', finish);

            reader1.on('error', reject);
            reader2.on('error', reject);

            fileStream1.pipe(reader1);
            fileStream2.pipe(reader2);
        });
    }


    public resamplePCM(
        inputBuffer: Buffer,
        originalSampleRate: number,
        targetSampleRate: number,
        options: ResampleOptions = {},
    ): Buffer {
        const { bitDepth = 16, numChannels = 1 } = options;

        const samples = this.readSamples(inputBuffer, bitDepth);
        const channels = this.separateChannels(samples, numChannels);
        const ratio = targetSampleRate / originalSampleRate;

        const resampledChannels = channels.map(channel =>
            this.resampleChannel(channel, ratio)
        );

        const interleaved = this.interleaveChannels(resampledChannels);
        return this.writeSamples(interleaved, bitDepth);
    }

    public resampleLinearPcmData(inputBuffer, inputSampleRate, outputSampleRate, inputBitDepth = 16, outputBitDepth = 16) {
        // Ensure buffer length is a multiple of the byte size per sample
        if (inputBuffer.length % (inputBitDepth / 8) !== 0) {
            console.warn(
                `Input buffer length (${inputBuffer.length}) is not a multiple of ${
                    inputBitDepth / 8
                }. Padding with zero bytes.`
            );
            inputBuffer = Buffer.concat([inputBuffer, Buffer.alloc(1, 0)]);
        }

        const ratio = inputSampleRate / outputSampleRate;
        const inputSamples = inputBuffer.length / (inputBitDepth / 8);
        const outputSamples = Math.floor(inputSamples / ratio);
        const outputBuffer = Buffer.alloc(outputSamples * (outputBitDepth / 8));

        for (let i = 0; i < outputSamples; i++) {
            const srcPos = i * ratio;
            const idx = Math.floor(srcPos);
            const frac = srcPos - idx;

            const safeIdx = Math.min(idx, inputSamples - 1);
            const nextIdx = Math.min(idx + 1, inputSamples - 1);

            let s0, s1;
            if (inputBitDepth === 16) {
                s0 = inputBuffer.readInt16LE(safeIdx * 2);
                s1 = inputBuffer.readInt16LE(nextIdx * 2);
            } else if (inputBitDepth === 8) {
                s0 = inputBuffer.readUInt8(safeIdx) - 128;
                s1 = inputBuffer.readUInt8(nextIdx) - 128;
            } else {
                throw new Error("Unsupported input bit depth");
            }

            const interpolated = s0 + (s1 - s0) * frac;

            if (outputBitDepth === 16) {
                outputBuffer.writeInt16LE(
                    Math.max(-32768, Math.min(32767, Math.round(interpolated))),
                    i * 2
                );
            } else if (outputBitDepth === 8) {
                outputBuffer.writeUInt8(
                    Math.max(0, Math.min(255, Math.round(interpolated + 128))),
                    i
                );
            } else {
                throw new Error("Unsupported output bit depth");
            }
        }

        return outputBuffer;
    }

    private readSamples(buffer: Buffer, bitDepth: number): number[] {
        const bytesPerSample = bitDepth / 8;
        const numSamples = buffer.length / bytesPerSample;
        const samples = new Array(numSamples);

        for (let i = 0; i < numSamples; i++) {
            const offset = i * bytesPerSample;
            switch (bitDepth) {
                case 8:
                    samples[i] = buffer.readUInt8(offset) - 128;
                    break;
                case 16:
                    samples[i] = buffer.readInt16LE(offset);
                    break;
                case 32:
                    samples[i] = buffer.readInt32LE(offset);
                    break;
                default:
                    throw new Error(`Unsupported bit depth: ${bitDepth}`);
            }
        }
        return samples;
    }

    private separateChannels(samples: number[], numChannels: number): number[][] {
        const channels = Array.from({ length: numChannels }, () => []);
        for (let i = 0; i < samples.length; i++) {
            channels[i % numChannels].push(samples[i]);
        }
        return channels;
    }

    private resampleChannel(input: number[], ratio: number): number[] {
        const outputLength = Math.round(input.length * ratio);
        const output = new Array(outputLength);

        for (let j = 0; j < outputLength; j++) {
            const x = j / ratio;
            const k = Math.floor(x);
            const delta = x - k;

            const idx0 = this.clamp(k - 1, input.length);
            const idx1 = this.clamp(k, input.length);
            const idx2 = this.clamp(k + 1, input.length);
            const idx3 = this.clamp(k + 2, input.length);

            output[j] = this.cubicInterpolate(
                input[idx0],
                input[idx1],
                input[idx2],
                input[idx3],
                delta
            );
        }
        return output;
    }

    private clamp(index: number, length: number): number {
        return Math.max(0, Math.min(length - 1, index));
    }

    private cubicInterpolate(y0: number, y1: number, y2: number, y3: number, t: number): number {
        const a = -y0 + 3*y1 - 3*y2 + y3;
        const b = 2*y0 - 5*y1 + 4*y2 - y3;
        const c = -y0 + y2;
        const d = 2*y1;
        return 0.5 * (a*t**3 + b*t**2 + c*t + d);
    }

    private interleaveChannels(channels: number[][]): number[] {
        const numChannels = channels.length;
        const length = channels[0].length;
        const result = new Array(numChannels * length);

        for (let i = 0; i < length; i++) {
            for (let c = 0; c < numChannels; c++) {
                result[i*numChannels + c] = channels[c][i];
            }
        }
        return result;
    }

    private writeSamples(samples: number[], bitDepth: number): Buffer {
        const bytesPerSample = bitDepth / 8;
        const buffer = Buffer.alloc(samples.length * bytesPerSample);

        for (let i = 0; i < samples.length; i++) {
            let val = samples[i];
            const offset = i * bytesPerSample;

            switch (bitDepth) {
                case 8:
                    val = Math.max(-128, Math.min(127, Math.round(val))) + 128;
                    buffer.writeUInt8(val, offset);
                    break;
                case 16:
                    val = Math.max(-32768, Math.min(32767, Math.round(val)));
                    buffer.writeInt16LE(val, offset);
                    break;
                case 32:
                    val = Math.max(-2147483648, Math.min(2147483647, Math.round(val)));
                    buffer.writeInt32LE(val, offset);
                    break;
            }
        }
        return buffer;
    }

    public buildRTPPacket(payload: Buffer,
                   seq: number,
                   timestamp: number,
                   ssrc: number,
                   payloadType: number
    ) {
        const header = Buffer.alloc(12);
        header.writeUInt8(0x80, 0); // Version(2), Padding(0), Extension(0), CC(0)
        header.writeUInt8(payloadType, 1);
        header.writeUInt16BE(seq, 2); // Sequence Number
        header.writeUInt32BE(timestamp, 4); // Timestamp
        header.writeUInt32BE(ssrc, 8); // SSRC (идентификатор потока)
        return Buffer.concat([header, payload]);
    }

    public removeRTPHeader(payload: Buffer, swap16: boolean = true) {

        const buf: Buffer = payload.subarray(12); // Убираем 12-байтовый RTP-заголовок

        //Меняет порядок байтов (swap16), если это необходимо.
        if (swap16) {
            buf.swap16()
        }

        return buf;
    }



}
