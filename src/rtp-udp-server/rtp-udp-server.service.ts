import {Inject, Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import * as fs from 'fs';
import * as path from 'path';
import { alaw, utils, mulaw } from "x-law";
import {AudioResampleService} from "../audio-resample/audio-resample.service";
import {AudioStreamRTPService} from "../audio-stream/audio-stream.service";

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private startingStream: boolean = false
    private writeStream: fs.WriteStream;
    private readonly swap16 = true;
    private externalAddress: string
    private externalPort: number
    private fileOutPath = path.join(__dirname, '..', 'audio_files', `audio_out_${Date.now()}.raw`);
    private audioStreamService: AudioStreamRTPService


//    private RTP_PAYLOAD_TYPE = 8;    // G.711 A-law
    private RTP_SSRC = Math.floor(Math.random() * 0xffffffff); // Уникальный идентификатор потока
    private SEQ_START = Math.floor(Math.random() * 65535);

    constructor(
        private openAi: OpenAiService,
        private vosk: VoskServerService,
        private audioResamplePcm: AudioResampleService,
) {}

    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }
        const fileInPath = path.join(audioDir, `audio_in_${Date.now()}.raw`);


        this.writeStream = fs.createWriteStream(fileInPath);

        this.server.on('message', async (msg, rinfo) => {

            if (!this.startingStream) {
                this.externalAddress = rinfo.address
                this.externalPort = rinfo.port
                console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
                this.startingStream = true;
            }

            try {
                let buf: Buffer = msg.slice(12); // Убираем 12-байтовый RTP-заголовок

                //Меняет порядок байтов (swap16), если это необходимо.
                if (this.swap16) {
                    buf.swap16()
                }

                this.writeStream.write(buf);
                this.server.emit('data', buf);
            } catch (error) {
                console.error(`Error processing RTP packet: ${error}`);
            }
        });

        this.server.on('data', async (audioBuffer: Buffer) => {
            const transcription = await this.vosk.audioAppend(audioBuffer);
            if (transcription) {
                console.log('User text: ', transcription,)
                const aiText = await this.openAi.textResponse(transcription)
                if (aiText) {
                    console.log('AI text: ', aiText)
                    const voice = await this.openAi.textToSpeech(aiText)
                    if (voice && this.externalAddress && this.externalPort) {
                        console.log('AI voice got')
                        // Отправляем назад поток
                        // await fs.promises.writeFile(fileOutPath,voice);
                        await this.convertAndStreamPCM(voice)

                    }
                }
            }
        });

        this.server.on('error', (err) => {
            console.error(`UDP Server error: ${err.stack}`);
            this.startingStream = false
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
        if (this.writeStream) {
            this.writeStream.end();
        }
    }

    buildRTPPacket(payload, seq, timestamp, ssrc) {
        const header = Buffer.alloc(12);

//        header[0] = 0x80; // RTP Version 2, без расширений, без CSRC
 //       // header[1] = this.RTP_PAYLOAD_TYPE & 0x7F; // Payload Type (G.711 A-law)
        header.writeUInt8(0x80, 0); // Version(2), Padding(0), Extension(0), CC(0)
//        header.writeUInt8(0x0B, 1); // Marker(0), Payload Type 11 (L16/16000)
//        header.writeUInt8(0x89, 1); // Marker(0), Payload Type 9 (L16/8000)
        header.writeUInt8(0x00, 1); // Marker=0, Payload Type=0 (G.711 U-law)
//        header.writeUInt8(0x08, 1); // Marker(0), Payload Type 8 (G.711 A-law)
//        header[1] = 0x11; // Payload type 17 (L16/16000)
//        header.writeUInt8(0x0, 1);  // Marker(0), Payload Type (настраивается)
//        header.writeUInt8(0x60, 1);     // Marker(0), PT=96 (0x60 = 96 << 1)

        header.writeUInt16BE(seq, 2); // Sequence Number
        header.writeUInt32BE(timestamp, 4); // Timestamp
        header.writeUInt32BE(ssrc, 8); // SSRC (идентификатор потока)

        return Buffer.concat([header, payload]);
    }



    async convertAndStreamPCM(inputBuffer) {

        const resampled = this.audioResamplePcm.resamplePCM(
            inputBuffer,
            24000,
            8000,
            { bitDepth: 16, numChannels: 1 }
        );

         // const resampled = await this.resamplePcmData(inputBuffer, 24000, 8000, 16, 16);
        //const resampled = Buffer.from(resampledArray); // Преобразуем в Buffer
        // await fs.promises.writeFile(this.fileOutPath,resampled);

            //const resampled = utils.resample(resampledBuffer, 16000, 8000, 16);
//         const resampled = this.downSampleBuffer(convertBuffer,24000, 16000);

//        const resampled = await this.resamplePCM(inputBuffer, 24000, 8000);
        // const resampled = inputBuffer.swap16()
        const resampledBuffer = mulaw.encodeBuffer(resampled)

        let seq = this.SEQ_START;
        let timestamp = 0;
        const packetSize = 160; // 16000 * 0.02 * 2 bytes
        const packetDurationMs = 20; // Интервал отправки (соответствует 160 байтам)
        const timestamp_inc = 160;     // 16000 * 20ms / 1000

        let i = 0;

        const sendPacket = (scheduledTime = Date.now()) => {
            if (i >= resampledBuffer.length) {
                console.log('RTP stream sent.');
                return;
            }

            const chunk = resampledBuffer.subarray(i, i + packetSize);
            const rtpPacket = this.buildRTPPacket(chunk, seq, timestamp, this.RTP_SSRC);

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

    onHangup() {
        console.log('Closing UDP stream...');
        this.server.close();
    }

}
