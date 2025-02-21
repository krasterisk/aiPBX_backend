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
    private openai: OpenAiService
    private audioBuffer: Buffer[] = [];
    private readonly MAX_BUFFER_SIZE = 32 * 1024; // 32kb

    constructor() {
        this.openai = new OpenAiService()
        this.server = dgram.createSocket('udp4');

        this.server.on('message', async (msg, rinfo) => {
            console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
            // const pcmData = this.alawToPcm(msg);
            // this.writeStream.write(pcmData);
            // const pcmData = this.base64EncodeAudio(msg)
            try {
                // Буферизация пакетов для обеспечения порядка
                this.audioBuffer.push(msg);

                // Проверка размера буфера
                if (this.audioBuffer.length > this.MAX_BUFFER_SIZE) {
                    const data = msg.toString('base64')
                    this.openai.sendAudioData(data)
                    this.audioBuffer.length = 0
                }
            } catch (error) {
                console.error(`Error processing RTP packet: ${error}`);
            }
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

    onModuleDestroy() {
        console.log('Closing RTP server and file stream...');
        // this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
    }

    onHangup() {
        console.log('Closing RTP file stream...');
        this.writeStream.end();
        this.server.close();
    }



    // Converts Float32Array of audio data to PCM16 ArrayBuffer
    private floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }
        return buffer;
    }

// Converts a Float32Array to base64-encoded PCM16 data
    private base64EncodeAudio(float32Array) {
        const arrayBuffer = this.floatTo16BitPCM(float32Array);
        let binary = '';
        let bytes = new Uint8Array(arrayBuffer);
        const chunkSize = 0x8000; // 32KB chunk size
        for (let i = 0; i < bytes.length; i += chunkSize) {
            let chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }
}
