import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'dgram';
import { Mutex } from 'async-mutex';
import {FileWriter} from "wav";
import path from "path";
import {AudioService} from "./audio.service";
import fs from "fs";

interface StreamState {
    bufferQueue: Buffer[];
    isProcessing: boolean;
    seq: number;
    timestamp: number;
    abortController: AbortController;
    streamData: StreamData;
    writeStreamOut?: FileWriter;
    outFilePath?: string;
}

interface StreamData {
    external_local_Address: string;
    external_local_Port: number;
}

@Injectable()
export class StreamAudioService {
    private logger = new Logger(StreamAudioService.name);
    private streams = new Map<string, StreamState>();
    private mutex = new Mutex();
    private RTP_SSRC = Math.floor(Math.random() * 0xffffffff);

    constructor(
        private server: dgram.Socket,
        private audioService: AudioService,
    ) {}


    // Добавление потока с инициализацией состояния
    public async addStream(sessionId: string, streamData: StreamData) {
        const release = this.mutex.acquire();
        try {
            if (!this.streams.has(sessionId)) {
                const audioDir = path.join(__dirname, '..', 'audio_files');
                if (!fs.existsSync(audioDir)) {
                    fs.mkdirSync(audioDir);
                }

                const filePath = path.join(audioDir, `audio_out_${sessionId}.wav`);
                const writer = this.audioService.createWavWriteStream(filePath);

                this.streams.set(sessionId, {
                    bufferQueue: [],
                    isProcessing: false,
                    seq: Math.floor(Math.random() * 65535),
                    timestamp: 0,
                    abortController: new AbortController(),
                    streamData,
                    writeStreamOut: writer,
                    outFilePath: filePath
                });
                this.logger.log(`Stream ${sessionId} initialized for ${streamData.external_local_Address}:${streamData.external_local_Port}`);
            }
        } finally {
            (await release)();
        }
    }

    // Удаление потока с отменой текущих операций
    public async removeStream(sessionId: string) {
        const release = this.mutex.acquire();
        try {
            const state = this.streams.get(sessionId);
            if (state) {
                state.abortController.abort();
                this.streams.delete(sessionId);
                if (state.writeStreamOut) {
                    const audioDir = path.join(__dirname, '..', 'static');
                    if (!fs.existsSync(audioDir)) {
                        fs.mkdirSync(audioDir);
                    }
                    const audioIn = path.join(audioDir, `audio_in_${sessionId}.wav`);
                    const audioFile = path.join(audioDir, `audio_mixed_${sessionId}.wav`);
                    await state.writeStreamOut.end();
                    await this.audioService.mixWavFiles(audioIn, state.outFilePath, audioFile)
                }

                this.logger.log(`Stream ${sessionId} removed`);
            }
        } finally {
            (await release)();
        }
    }

    // Удаление потока с отменой текущих операций
    public async interruptStream(sessionId: string) {
        const release = await this.mutex.acquire();
        try {
            const state = this.streams.get(sessionId);
            if (state) {
                // Прервать текущую обработку
                state.abortController.abort();

                // Очистить очередь аудиобуфера
                state.bufferQueue.length = 0;

                // Создать новый AbortController для возобновления потока
                state.abortController = new AbortController();

                // Сбросить статус обработки (иначе не запустится при следующем вызове)
                state.isProcessing = false;

                this.logger.log(`Stream ${sessionId} was interrupted and reset`);
            }
        } finally {
            release();
        }
    }

    // Добавление аудиоданных в очередь с гарантией последовательности
    public async streamAudio(sessionId: string, outputBuffer: Buffer) {
        const release = await this.mutex.acquire();
        try {
            const state = this.streams.get(sessionId);
            if (!state) {
                this.logger.error(`Stream ${sessionId} not found`);
                return;
            }
            state.bufferQueue.push(outputBuffer);
            if (!state.isProcessing) {
                state.isProcessing = true;
                this.processQueue(sessionId, state).catch(err =>
                    this.logger.error(`Processing error: ${err}`)
                );
            }
        } finally {
            release();
        }
    }

    // Обработка очереди с использованием AbortController
    private async processQueue(sessionId: string, state: StreamState) {
        const { abortController } = state;

        while (state.bufferQueue.length > 0 && !abortController.signal.aborted) {
            const buffer = state.bufferQueue.shift()!;
            await this.sendBuffer(sessionId, buffer, abortController);
        }

        state.isProcessing = false;
    }

    // Отправка буфера с контролем тайминга
    private async sendBuffer(
        sessionId: string,
        buffer: Buffer,
        abortController: AbortController
    ) {
        return new Promise<void>((resolve, reject) => {
            if (abortController.signal.aborted) return resolve();

            let offset = 0;
            const startTime = Date.now();
            const packetSize = 160;
            const packetDurationMs = 20;

            const sendNextPacket = () => {
                if (abortController.signal.aborted || offset >= buffer.length) {
                    return resolve();
                }

                const chunk = buffer.subarray(offset, offset + packetSize);
                this.sendRtpPacket(sessionId, chunk);

                offset += packetSize;
                const nextPacketTime = startTime + (offset / packetSize) * packetDurationMs;
                const delay = Math.max(0, nextPacketTime - Date.now());

                setTimeout(sendNextPacket, delay);
            };

            sendNextPacket();
        });
    }

    // Отправка RTP-пакета с обработкой ошибок
    private sendRtpPacket(sessionId: string, chunk: Buffer) {
        const state = this.streams.get(sessionId);
        if (!state) return;

        const { external_local_Address, external_local_Port } = state.streamData;

        const rtpPacket = this.buildRTPPacket(
            chunk,
            state.seq,
            state.timestamp,
            this.RTP_SSRC,
            0x08 // a-law: 0x08 u-law: 0x00
        );

        state.seq = (state.seq + 1) & 0xffff;
        state.timestamp += 160;

        // this.debugRtpHeader(rtpPacket);

        if (state.writeStreamOut) {
            this.audioService.writeChunkToStream(state.writeStreamOut, chunk);
        }

        this.server.send(rtpPacket, external_local_Port, external_local_Address, (err) => {
            if (err) this.logger.error(`Send error [${sessionId}]: ${err}`);
        });
    }

// debug RTP packet
    private debugRtpHeader(buffer: Buffer) {
        const version = (buffer[0] >> 6) & 0b11;
        const padding = (buffer[0] >> 5) & 0b1;
        const extension = (buffer[0] >> 4) & 0b1;
        const csrcCount = buffer[0] & 0b1111;

        const marker = (buffer[1] >> 7) & 0b1;
        const payloadType = buffer[1] & 0b01111111;

        const sequenceNumber = buffer.readUInt16BE(2);
        const timestamp = buffer.readUInt32BE(4);
        const ssrc = buffer.readUInt32BE(8);

        console.log('--- RTP Header ---');
        console.log('Version:', version);
        console.log('Padding:', padding);
        console.log('Extension:', extension);
        console.log('CSRC Count:', csrcCount);
        console.log('Marker:', marker);
        console.log('Payload Type:', payloadType);
        console.log('Sequence Number:', sequenceNumber);
        console.log('Timestamp:', timestamp);
        console.log('SSRC:', '0x' + ssrc.toString(16));
        console.log('Payload Length:', buffer.length - 12);
    }


    private buildRTPPacket(payload: Buffer,
                          seq: number,
                          timestamp: number,
                          ssrc: number,
                          payloadType: number
    ) {
        const header = Buffer.alloc(12);
        header.writeUInt8(0x80, 0); // Version(2), Padding(0), Extension(0), CC(0)
        header.writeUInt8(payloadType, 1);
        header.writeUInt16BE(seq, 2); // Sequence Number
        header.writeUInt32BE(timestamp, 4); // Timestamp
        header.writeUInt32BE(ssrc, 8); // SSRC (идентификатор потока)
        return Buffer.concat([header, payload]);
    }

    // async convertAndStreamPCM(inputBuffer, serverData: StreamData) {
    //
    //     // const resampled = this.audioService.resamplePCM(
    //     //     inputBuffer,
    //     //     24000,
    //     //     8000,
    //     //     {bitDepth: 16, numChannels: 1}
    //     // );
    //
    //     //const resampledBuffer = mulaw.encodeBuffer(resampled)
    //     const resampledBuffer = mulaw.encodeBuffer(inputBuffer)
    //
    //     // let seq = this.SEQ_START;
    //     let timestamp = 0;
    //     const packetSize = 160; // 16000 * 0.02 * 2 bytes
    //     const packetDurationMs = 20; // Интервал отправки (соответствует 160 байтам)
    //     const timestamp_inc = 160;     // 16000 * 20ms / 1000
    //
    //     let i = 0;
    //
    //     const sendPacket = (scheduledTime = Date.now()) => {
    //         if (i >= resampledBuffer.length) {
    //             console.log('RTP stream sent on ' + `${serverData.external_local_Address}:${serverData.external_local_Port}`);
    //             return;
    //         }
    //
    //         const chunk = resampledBuffer.subarray(i, i + packetSize);
    //         const rtpPacket = this.buildRTPPacket(
    //             chunk,
    //             seq,
    //             timestamp,
    //             this.RTP_SSRC,
    //             0x00 // Payload Type для U-Law G.711
    //         );
    //
    //         this.server.send(rtpPacket, serverData.external_local_Port, serverData.external_local_Address, (err) => {
    //             if (err) console.error('RTP send error:', err);
    //         });
    //
    //         seq = (seq + 1) & 0xFFFF; // Инкремент с переполнением
    //         timestamp += timestamp_inc; // Увеличиваем timestamp
    //
    //         i += packetSize;
    //
    //         const now = Date.now();
    //         const drift = now - scheduledTime;
    //         const nextInterval = packetDurationMs - drift;
    //
    //         setTimeout(
    //             () => sendPacket(scheduledTime + packetDurationMs),
    //             Math.max(0, nextInterval)
    //         );
    //     };
    //
    //     sendPacket(); // Запускаем отправку
    // }

}
