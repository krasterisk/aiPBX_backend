import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as dgram from "dgram";
import { OpenAiService, sessionData } from "../open-ai/open-ai.service";
import * as fs from 'fs';
import * as path from 'path';
import { AudioService } from "../audio/audio.service";
import { OpenAiConnection } from "../open-ai/open-ai.connection";
import { Assistant } from "../assistants/assistants.model";

interface requestData {
    channelId?: string,
    address: string,
    port: string,
    init?: string
    openAiConn?: OpenAiConnection
    events?: object[],
    assistant?: Assistant
}

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private UDP_PORT = Number(process.env.UDP_SERVER_PORT);
    //     private UDP_PORT = Math.floor(
    //         Math.random() * 5001 // 5000 + 1, чтобы включить верхнюю границу
    //     ) + Number(process.env.UDP_SERVER_PORT);

    public server: dgram.Socket;
    private external_local_Address: string
    private external_local_Port: number
    public sessions = new Map<string, requestData>();
    private logger = new Logger(RtpUdpServerService.name);
    private activeChannels = new Set<string>();

    constructor(
        private openAi: OpenAiService,
        //        private vosk: VoskServerService,
        private audioService: AudioService,
    ) {
    }


    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'static');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }

        this.server.on('message', async (msg, rinfo) => {
            const sessionUrl = `${rinfo.address}:${rinfo.port}`
            const currentSession = this.sessions.get(sessionUrl);

            if (!currentSession) return

            if (currentSession && currentSession.init === 'false') {
                this.logger.log(`Starting incoming stream from ${rinfo.address}:${rinfo.port}`);
                currentSession.init = 'true';
                this.external_local_Address = rinfo.address
                this.external_local_Port = Number(rinfo.port)

                await this.openAi.updateRtAudioSession(currentSession)
                await this.openAi.rtInitAudioResponse(currentSession)
            }

            try {
                const audioChunk = this.audioService.removeRTPHeader(msg, false);

                if (currentSession?.assistant?.model?.startsWith('qwen') && !currentSession.channelId.startsWith('playground-')) {
                    const pcm16_8k = this.audioService.alawToPcm16(audioChunk);
                    const pcm16_16k = this.audioService.resampleLinear(pcm16_8k, 8000, 16000);
                    this.server.emit('data', pcm16_16k, currentSession.channelId);
                } else {
                    this.server.emit('data', audioChunk, currentSession.channelId);
                }
            } catch (error) {
                this.logger.error(`Error processing RTP packet: ${error}`);
            }
        });

        this.server.on('data', async (audioBuffer: Buffer, channelId: string) => {
            if (!channelId || this.activeChannels.has(channelId)) return;

            this.activeChannels.add(channelId);

            try {

                await this.openAi.rtInputAudioAppend(audioBuffer, channelId)

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
            } finally {
                this.activeChannels.delete(channelId);
                // await this.handleSessionEnd(channelId)
            }
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

    private getSessionByField(field: keyof sessionData, value: any) {
        return [...this.sessions.values()].find(session => {
            if (Array.isArray(session[field])) {
                return (session[field] as string[]).includes(value);
            }
            return session[field] === value;
        });
    }

    public async handleSessionEnd(sessionId: string) {
        const session = this.sessions.get(sessionId) ||
            this.getSessionByField('channelId', sessionId);

        if (session) {
            session.openAiConn?.close();
            this.logger.log(`Closing ${sessionId}...`);
        }

        this.sessions.delete(sessionId);
    }

    onModuleDestroy() {
        this.logger.log('Closing RTP server and file stream...');
        // this.writeStream.end(() => this.updateWavHeader());
        this.server.close();
    }

}
