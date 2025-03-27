import {Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import * as fs from 'fs';
import * as path from 'path';
import { mulaw } from "x-law";
import {AudioService} from "../audio/audio.service";
import { EventEmitter2 } from '@nestjs/event-emitter';

interface requestData {
    address: string,
    port: string,
    sessionId?: string
}

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private UDP_PORT = Number(process.env.UDP_SERVER_PORT);
//     private UDP_PORT = Math.floor(
//         Math.random() * 5001 // 5000 + 1, чтобы включить верхнюю границу
//     ) + Number(process.env.UDP_SERVER_PORT);

    public server: dgram.Socket;
    private startingStream: boolean = false
    private writeStream: fs.WriteStream;
    private externalAddress: string
    private externalPort: number
    private external_local_Address: string
    private external_local_Port: number

//    private RTP_PAYLOAD_TYPE = 8;    // G.711 A-law
    private RTP_SSRC = Math.floor(Math.random() * 0xffffffff); // Уникальный идентификатор потока
    private SEQ_START = Math.floor(Math.random() * 65535);
    private logger = new Logger(RtpUdpServerService.name);

    constructor(
        private openAi: OpenAiService,
        //        private vosk: VoskServerService,
        private audioService: AudioService,
        private eventEmitter: EventEmitter2
    ) {}

    private audioStreamState = {
        isSending: false,
        bufferQueue: [] as Buffer[],
        seq: this.SEQ_START,
        timestamp: 0,
        lastSendTime: Date.now(),
        packetSize: 160, // Для G.711 ulaw
        packetDurationMs: 20,
        timestampIncrement: 160
    };

    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }
        const fileInPath = path.join(audioDir, `audio_in_${Date.now()}.raw`);
        const fileOutPath = path.join(audioDir, `audio_out_${Date.now()}.raw`);

        this.eventEmitter.on('delta', async (outAudio: Buffer) => {
            // console.log('streaming audio chunk')
           await this.streamAudio(outAudio);
        });


        this.server.on('message', async (msg, rinfo) => {

            if (!this.startingStream) {
                console.log(`Starting incoming stream from ${rinfo.address}:${rinfo.port}`);
                this.startingStream = true;
                this.external_local_Address = rinfo.address
                this.external_local_Port = Number(rinfo.port)
                const metadata: requestData = {
                    address: rinfo.address,
                    port: String(rinfo.port)
                }
                await this.openAi.rtInitAudioResponse(metadata)
            }

            try {
                const eventId = `${rinfo.address}:${rinfo.port}`
                // this.writeStream.write(buf);
                this.server.emit('data', msg, eventId);
            } catch (error) {
                console.error(`Error processing RTP packet: ${error}`);
            }
        });

        this.server.on('data', async (audioBuffer: Buffer, eventId: string) => {
            //this.writeStream = fs.createWriteStream(fileInPath);
            const audioChunk = this.audioService.removeRTPHeader(audioBuffer, false)
            await this.openAi.rtInputAudioAppend(audioChunk, eventId)

            // const transcription = await this.vosk.audioAppend(audioChunk);
            // if (transcription) {
            //     console.log('User text: ', transcription,)
            //     // const aiText = await this.openAi.textResponse(transcription)
            //     const aiText = await this.openAi.rtTextAppend(transcription)
//                console.log(aiText)
            // if (aiText) {
            //     console.log('AI text: ', aiText)
            //     const voice = await this.openAi.textToSpeech(aiText)
            //     if (voice && this.externalAddress && this.externalPort) {
            //         console.log('AI voice got')
            //         // Отправляем назад поток
            //         await this.convertAndStreamPCM(voice)

            // }
            // }
//            }
        });

        this.server.on('error', (err) => {
            console.error(`UDP Server error: ${err.stack}`);
            this.startingStream = false
            this.server.close();
        });

        this.server.on('listening', () => {
            const address = this.server.address();
            this.logger.log(`UDP Server listening on ${address.address}:${address.port}`);
        });

        this.server.bind(this.UDP_PORT);

    }

    onModuleDestroy() {
        console.log('Closing RTP server and file stream...');
        // this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
        if (this.writeStream) {
            this.writeStream.end();
        }
    }

    async convertAndStreamPCM(inputBuffer) {

        const resampled = this.audioService.resamplePCM(
            inputBuffer,
            24000,
            8000,
            {bitDepth: 16, numChannels: 1}
        );

        const resampledBuffer = mulaw.encodeBuffer(resampled)

        let seq = this.SEQ_START;
        let timestamp = 0;
        const packetSize = 160; // 16000 * 0.02 * 2 bytes
        const packetDurationMs = 20; // Интервал отправки (соответствует 160 байтам)
        const timestamp_inc = 160;     // 16000 * 20ms / 1000

        let i = 0;

        const sendPacket = (scheduledTime = Date.now()) => {
            if (i >= resampledBuffer.length) {
                console.log('RTP stream sent on ' + `${this.externalAddress}:${this.externalPort}`);
                return;
            }

            const chunk = resampledBuffer.subarray(i, i + packetSize);
            const rtpPacket = this.audioService.buildRTPPacket(
                chunk,
                seq,
                timestamp,
                this.RTP_SSRC,
                0x00 // Payload Type для U-Law G.711
            );

            this.server.send(rtpPacket, this.externalPort, this.externalAddress, (err) => {
                if (err) console.error('RTP send error:', err);
            });

            seq = (seq + 1) & 0xFFFF; // Инкремент с переполнением
            timestamp += timestamp_inc; // Увеличиваем timestamp

            i += packetSize;

            const now = Date.now();
            const drift = now - scheduledTime;
            const nextInterval = packetDurationMs - drift;

            setTimeout(
                () => sendPacket(scheduledTime + packetDurationMs),
                Math.max(0, nextInterval)
            );
        };

        sendPacket(); // Запускаем отправку
    }

    async streamAudio(outputBuffer: Buffer) {
        this.audioStreamState.bufferQueue.push(outputBuffer);
        if (!this.audioStreamState.isSending) {
            this.audioStreamState.isSending = true;
            await this.processBufferQueue();
        }
    }

    private async processBufferQueue() {
        while (this.audioStreamState.bufferQueue.length > 0) {
            const currentBuffer = this.audioStreamState.bufferQueue.shift()!;
            await this.sendBuffer(currentBuffer);
        }
        this.audioStreamState.isSending = false;
    }

    private async sendBuffer(buffer: Buffer) {
        let offset = 0;
        const startTime = Date.now();
        // const expectedPackets = buffer.length / this.audioStreamState.packetSize;
        // const expectedDuration = expectedPackets * this.audioStreamState.packetDurationMs;

        while (offset < buffer.length) {
            const chunk = buffer.subarray(offset, offset + this.audioStreamState.packetSize);
            const rtpPacket = this.audioService.buildRTPPacket(
                chunk,
                this.audioStreamState.seq,
                this.audioStreamState.timestamp,
                this.RTP_SSRC,
                0x00
            );

            // Рассчет времени отправки
            const packetIndex = offset / this.audioStreamState.packetSize;
            const targetTime = startTime + packetIndex * this.audioStreamState.packetDurationMs;
            const delay = Math.max(0, targetTime - Date.now());

            await new Promise(resolve => setTimeout(resolve, delay));

            this.server.send(rtpPacket, this.external_local_Port, this.external_local_Address, (err) => {
                if (err) console.error('RTP send error:', err);
            });

            // Обновляем состояние
            this.audioStreamState.seq = (this.audioStreamState.seq + 1) & 0xFFFF;
            this.audioStreamState.timestamp += this.audioStreamState.timestampIncrement;
            offset += this.audioStreamState.packetSize;
        }
    }

}
