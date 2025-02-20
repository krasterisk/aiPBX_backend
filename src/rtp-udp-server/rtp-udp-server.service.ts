import {Injectable, OnModuleDestroy} from '@nestjs/common';
import * as dgram from "dgram";
import * as fs from "fs";
import * as path from "path";
import {OpenAiService} from "../open-ai/open-ai.service";

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private writeStream: fs.WriteStream;
    private readonly filePath: string;
    private headerSize = 44;
    private openai: OpenAiService

    constructor() {
        this.filePath = path.join(__dirname, `audio_${Date.now()}.wav`);
        this.writeStream = fs.createWriteStream(this.filePath);
        this.openai = new OpenAiService()
        // WAV Header (placeholder, updated on close)
        const wavHeader = Buffer.alloc(this.headerSize);
        this.writeStream.write(wavHeader);

        this.server = dgram.createSocket('udp4');

        this.server.on('message', (msg, rinfo) => {
            console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
            // const pcmData = this.alawToPcm(msg);
            // this.writeStream.write(pcmData);

            this.openai.sendAudioData(msg)
        });

        this.server.on('error', (err) => {
            console.error(`UDP Server error: ${err.stack}`);
            this.server.close();
        });

        this.server.on('listening', () => {
            const address = this.server.address();
            console.log(`UDP Server listening on ${address.address}:${address.port}`);
        });
        this.server.bind(this.PORT);
    }

    onHangup() {
        console.log('Closing RTP file stream...');
        this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
    }

    private updateWavHeader() {
        const fileSize = fs.statSync(this.filePath).size;
        const dataSize = fileSize - this.headerSize;

        const buffer = Buffer.alloc(44);
        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(fileSize - 8, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20); // PCM format
        buffer.writeUInt16LE(1, 22);
        buffer.writeUInt32LE(8000, 24);
        buffer.writeUInt32LE(16000, 28);
        buffer.writeUInt16LE(2, 32);
        buffer.writeUInt16LE(16, 34);
        buffer.write('data', 36);
        buffer.writeUInt32LE(dataSize, 40);

        const fd = fs.openSync(this.filePath, 'r+');
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
    }

    private alawToPcm(alawData: Buffer): Buffer {
        const pcmData = Buffer.alloc(alawData.length * 2);
        for (let i = 0; i < alawData.length; i++) {
            const sample = this.decodeAlawSample(alawData[i]);
            pcmData.writeInt16LE(sample, i * 2);
        }
        return pcmData;
    }

    private decodeAlawSample(alaw: number): number {
        alaw ^= 0x55;
        let sign = alaw & 0x80;
        let exponent = (alaw & 0x70) >> 4;
        let mantissa = alaw & 0x0F;
        let sample = (mantissa << 4) + 8;
        if (exponent !== 0) {
            sample += 0x100;
            sample <<= exponent - 1;
        }
        return sign === 0 ? sample : -sample;
    }
    onModuleDestroy() {
        console.log('Closing RTP server and file stream...');
        // this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
    }
}
