import { Injectable, Logger } from '@nestjs/common';
import * as dgram from 'dgram';
import { Mutex } from 'async-mutex';

interface StreamState {
    bufferQueue: Buffer[];
    isProcessing: boolean;
    seq: number;
    timestamp: number;
    abortController: AbortController;
    streamData: StreamData;
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

    constructor(private server: dgram.Socket) {}

    // Добавление потока с инициализацией состояния
    public async addStream(sessionId: string, streamData: StreamData) {
        const release = this.mutex.acquire();
        try {
            if (!this.streams.has(sessionId)) {
                this.streams.set(sessionId, {
                    bufferQueue: [],
                    isProcessing: false,
                    seq: Math.floor(Math.random() * 65535),
                    timestamp: 0,
                    abortController: new AbortController(),
                    streamData
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
                this.logger.log(`Stream ${sessionId} removed`);
            }
        } finally {
            (await release)();
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
            0x08 // a-law u-law: 0x00
        );

        state.seq = (state.seq + 1) & 0xffff;
        state.timestamp += 160;

        this.server.send(rtpPacket, external_local_Port, external_local_Address, (err) => {
            if (err) this.logger.error(`Send error [${sessionId}]: ${err}`);
        });
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
