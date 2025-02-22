import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import * as fs from "fs";
import {OpenAiService} from "../open-ai/open-ai.service";

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private writeStream: fs.WriteStream;
    private audioBuffer: Buffer[] = [];
    private readonly MAX_BUFFER_SIZE = 500; // 32kb
    private openAi: OpenAiService

    constructor() {
        this.server = dgram.createSocket('udp4');

        this.server.on('message', async (msg, rinfo) => {
            console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
            // const pcmData = this.alawToPcm(msg);
            // this.writeStream.write(pcmData);
            // const pcmData = this.base64EncodeAudio(msg)

            try {
                const data = msg.toString('base64')
                this.openAi.audioAppend(data)
                // this.ws.send(JSON.stringify({
                //     type: 'input_audio_buffer.append',
                //     audio: data
                // }));

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

        // const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";
        //
        //     this.ws = new WebSocket(url, {
        //         headers: {
        //             "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        //             "OpenAI-Beta": "realtime=v1",
        //         },
        //     });
        //
        //     this.ws.on('open', () => {
        //         console.log('Connected to WebSocket OpenAI Realtime API');
        //     });
        //
        //     this.ws.on('message', (data) => {
        //         // Обработка полученных сообщений от OpenAI
        //         console.log('Received:', data.toString());
        //     });
        //
        // } catch (e) {
        //     console.log("error connect to realtime api", e)
        // }
    }

    onModuleDestroy() {
        console.log('Closing RTP server and file stream...');
        // this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
    }

    onHangup() {
        console.log('Closing RTP file stream...');
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
