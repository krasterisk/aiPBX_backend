import {Inject, Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import * as fs from 'fs';
import * as path from 'path';
import { mulaw } from "x-law";
import {AudioService} from "../audio/audio.service";

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private startingStream: boolean = false
    private writeStream: fs.WriteStream;
    private readonly swap16 = true;
    public externalAddress: string
    public externalPort: number
    private fileOutPath = path.join(__dirname, '..', 'audio_files', `audio_out_${Date.now()}.raw`);
//    private RTP_PAYLOAD_TYPE = 8;    // G.711 A-law
    private RTP_SSRC = Math.floor(Math.random() * 0xffffffff); // Уникальный идентификатор потока
    private SEQ_START = Math.floor(Math.random() * 65535);

    constructor(
        private openAi: OpenAiService,
//        private vosk: VoskServerService,
        private audioService: AudioService,
) {}

    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }
        const fileInPath = path.join(audioDir, `audio_in_${Date.now()}.raw`);
        const fileOutPath = path.join(audioDir, `audio_out_${Date.now()}.raw`);


        this.writeStream = fs.createWriteStream(fileInPath);

        this.server.on('message', async (msg, rinfo) => {

            if (!this.startingStream) {
                console.log(`Starting incoming stream from ${rinfo.address}:${rinfo.port}`);
                this.startingStream = true;
            }

            try {

                // this.writeStream.write(buf);
                this.server.emit('data', msg);
            } catch (error) {
                console.error(`Error processing RTP packet: ${error}`);
            }
        });

        this.server.on('data', async (audioBuffer: Buffer) => {

            // const audioChunk = this.audioService.removeRTPHeader(audioBuffer)
            const openAiVoice = this.openAi.rtInputAudioAppend(audioBuffer)
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

    onHangup() {
        console.log('Closing UDP stream...');
        this.server.close();
    }

}
