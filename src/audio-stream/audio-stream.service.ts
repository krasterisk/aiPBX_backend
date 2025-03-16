import { Injectable } from '@nestjs/common';

export interface RtpPacketizerOptions {
    ssrc?: number;
    sampleRate?: number;
    payloadType?: number;
}

@Injectable()
export class AudioStreamRTPService {

    private sequenceNumber: number;
    private timestamp: number;
    private readonly ssrc: number;
    private readonly sampleRate: number;
    private readonly payloadType: number;

    constructor(options?: RtpPacketizerOptions) {
        this.ssrc = options?.ssrc || Math.floor(Math.random() * 0xFFFFFFFF);
        this.sampleRate = options?.sampleRate || 8000;
        this.payloadType = options?.payloadType || 0; // PCMU
        this.sequenceNumber = Math.floor(Math.random() * 0xFFFF);
        this.timestamp = Math.floor(Math.random() * 0xFFFFFFFF);
    }

    public packet(audioData: Buffer, durationMs = 20): Buffer[] {
        const packetSize = Math.floor((this.sampleRate * durationMs) / 1000);
        const packets: Buffer[] = [];

        for (let offset = 0; offset < audioData.length; offset += packetSize) {
            const chunk = audioData.subarray(offset, offset + packetSize);
            if (chunk.length === 0) break;

            const header = this.createHeader(chunk.length);
            packets.push(Buffer.concat([header, chunk]));

            this.updateSequence();
            this.updateTimestamp(chunk.length);
        }

        return packets;
    }

    private createHeader(payloadLength: number): Buffer {
        const header = Buffer.alloc(12);
        header.writeUInt8(0x80, 0); // Version 2, no extensions/padding
        header.writeUInt8(this.payloadType, 1);
        header.writeUInt16BE(this.sequenceNumber, 2);
        header.writeUInt32BE(this.timestamp, 4);
        header.writeUInt32BE(this.ssrc, 8);
        return header;
    }

    private updateSequence(): void {
        this.sequenceNumber = (this.sequenceNumber + 1) % 0x10000;
    }

    private updateTimestamp(samples: number): void {
        this.timestamp = (this.timestamp + samples) % 0xFFFFFFFF;
    }
}

