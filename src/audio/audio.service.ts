import { Injectable, Logger } from '@nestjs/common';
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


    /**
     * Удаляет 12-байтовый RTP header
     * swap16 = true ТОЛЬКО для PCM16 / PCM24 (RTP big-endian)
     */
    public removeRTPHeader(payload: Buffer, swap16: boolean = false): Buffer {
        const audio = payload.subarray(12);

        if (swap16) {
            audio.swap16();
        }

        return audio;
    }

    /**
     * G.711 A-law (PCMA) → PCM16 (LE)
     * 8kHz → 8kHz
     */
    public alawToPcm16(input: Buffer): Buffer {
        const output = Buffer.alloc(input.length * 2);

        for (let i = 0; i < input.length; i++) {
            output.writeInt16LE(this.decodeAlaw(input[i]), i * 2);
        }

        return output;
    }

    private decodeAlaw(a: number): number {
        a ^= 0x55;
        let t = (a & 0x0f) << 4;
        const seg = (a & 0x70) >> 4;

        if (seg === 0) {
            t += 8;
        } else if (seg === 1) {
            t += 0x108;
        } else {
            t += 0x108;
            t <<= seg - 1;
        }

        return (a & 0x80) ? t : -t;
    }

    /**
     * PCM16 (LE) → G.711 A-law (PCMA)
     * 8kHz ← 8kHz
     */
    public pcm16ToAlaw(input: Buffer): Buffer {
        const output = Buffer.alloc(input.length / 2);

        for (let i = 0; i < output.length; i++) {
            const sample = input.readInt16LE(i * 2);
            output[i] = this.encodeAlaw(sample);
        }

        return output;
    }

    private encodeAlaw(sample: number): number {
        let sign = (sample >> 8) & 0x80;
        if (sign) sample = -sample;
        if (sample > 32635) sample = 32635;

        let exponent = 7;
        for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
            exponent--;
        }

        let mantissa = (sample >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f;

        return (sign | (exponent << 4) | mantissa) ^ 0x55;
    }

    /**
     * PCM24 → PCM16
     * endian: 'le' | 'be'
     */
    public pcm24ToPcm16(
        input: Buffer,
        endian: 'le' | 'be',
        gain: number = 1.0
    ): Buffer {
        const samples = Math.floor(input.length / 3);
        const output = Buffer.alloc(samples * 2);

        for (let i = 0; i < samples; i++) {
            const o = i * 3;

            let s =
                endian === 'le'
                    ? (input[o] | (input[o + 1] << 8) | (input[o + 2] << 16))
                    : (input[o + 2] | (input[o + 1] << 8) | (input[o] << 16));

            // sign extend
            if (s & 0x800000) s |= 0xff000000;

            // normalize to [-1..1]
            let v = (s / 8388608) * gain;

            // clamp
            v = Math.max(-1, Math.min(1, v));

            // float → pcm16
            output.writeInt16LE(Math.round(v * 32767), i * 2);
        }

        return output;
    }

    /**
     * Линейный ресемплинг PCM16 (LE)
     * Работает для 8k ↔ 16k ↔ 24k
     */
    public resampleLinear(
        input: Buffer,
        inRate: number,
        outRate: number
    ): Buffer {
        if (inRate === outRate) {
            return input;
        }

        const samples = input.length / 2;
        const outSamples = Math.floor(samples * outRate / inRate);
        const output = Buffer.alloc(outSamples * 2);

        for (let i = 0; i < outSamples; i++) {
            const t = i * inRate / outRate;
            const i0 = Math.floor(t);
            const i1 = Math.min(i0 + 1, samples - 1);
            const frac = t - i0;

            const s0 = input.readInt16LE(i0 * 2);
            const s1 = input.readInt16LE(i1 * 2);

            const sample = s0 + frac * (s1 - s0);
            output.writeInt16LE(sample | 0, i * 2);
        }

        return output;
    }

    public resampleLinearPcmData(inputBuffer, inputSampleRate, outputSampleRate, inputBitDepth = 16, outputBitDepth = 16) {
        // Ensure buffer length is a multiple of the byte size per sample
        if (inputBuffer.length % (inputBitDepth / 8) !== 0) {
            console.warn(
                `Input buffer length (${inputBuffer.length}) is not a multiple of ${inputBitDepth / 8
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
}
