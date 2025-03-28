import {Injectable, Logger, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import * as fs from 'fs';
import * as path from 'path';
import { mulaw } from "x-law";
import {AudioService} from "../audio/audio.service";
import { EventEmitter2 } from '@nestjs/event-emitter';
import {StreamAudioService} from "../audio/streamAudio.service";

interface requestData {
    channelId?: string,
    address: string,
    port: string,
    init?: string
    events?: object[]
}

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private UDP_PORT = Number(process.env.UDP_SERVER_PORT);
//     private UDP_PORT = Math.floor(
//         Math.random() * 5001 // 5000 + 1, чтобы включить верхнюю границу
//     ) + Number(process.env.UDP_SERVER_PORT);

    public server: dgram.Socket;
    private writeStream: fs.WriteStream;
    private externalAddress: string
    private externalPort: number
    private external_local_Address: string
    private external_local_Port: number
    public sessions = new Map<string, requestData>();
    private logger = new Logger(RtpUdpServerService.name);

    constructor(
        private openAi: OpenAiService,
        //        private vosk: VoskServerService,
        private audioService: AudioService,
        private eventEmitter: EventEmitter2,
        private readonly streamAudioService: StreamAudioService
    ) {}


    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }
        const fileInPath = path.join(audioDir, `audio_in_${Date.now()}.raw`);
        const fileOutPath = path.join(audioDir, `audio_out_${Date.now()}.raw`);

        this.eventEmitter.on('audioDelta', async (outAudio: Buffer, serverData: requestData) => {
            // console.log('streaming audio chunk')
            const sessionId = `${serverData.address}:${serverData.port}`;
            this.streamAudioService.addStream(sessionId, {
                external_local_Address: serverData.address,
                external_local_Port: Number(serverData.port),
            });
            await this.streamAudioService.streamAudio(sessionId, outAudio);
        });


        this.server.on('message', async (msg, rinfo) => {
            const sessionUrl = `${rinfo.address}:${rinfo.port}`
            const currentSession = this.sessions.get(sessionUrl);

            if (currentSession && currentSession.init === 'false') {
                console.log(`Starting incoming stream from ${rinfo.address}:${rinfo.port}`);
                currentSession.init = 'true';
                this.external_local_Address = rinfo.address
                this.external_local_Port = Number(rinfo.port)

                console.log("CURRENT SESSION: ", currentSession)

                await this.openAi.rtInitAudioResponse(currentSession)
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

}
