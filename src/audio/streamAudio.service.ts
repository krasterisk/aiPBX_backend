import {Injectable, Logger} from '@nestjs/common';
import * as dgram from 'dgram';
import {mulaw} from "x-law";

interface StreamState {
    bufferQueue: Buffer[];
    isSending: boolean;
    seq: number;
    timestamp: number;
}

interface StreamData {
    external_local_Address: string;
    external_local_Port: number;
}

@Injectable()
export class StreamAudioService {
    private logger = new Logger(StreamAudioService.name);
    // Храним состояние каждого потока по sessionId
    private streams = new Map<string, { state: StreamState; data: StreamData }>();
    private RTP_SSRC = Math.floor(Math.random() * 0xffffffff); // Уникальный идентификатор потока
    private SEQ_START = Math.floor(Math.random() * 65535);

    constructor(
        private server: dgram.Socket
    ) {}

    // Регистрируем новый поток (например, при установлении соединения)
    public addStream(sessionId: string, streamData: StreamData) {
        if (!this.streams.has(sessionId)) {
            this.streams.set(sessionId, {
                state: {
                    bufferQueue: [],
                    isSending: false,
                    seq: this.SEQ_START,
                    timestamp: 0,
                },
                data: streamData,
            });
            this.logger.log(`Started stream: ${sessionId}`);
        }
    }

    // Удаляем поток, когда он завершён
    public removeStream(sessionId: string) {
        if (this.streams.has(sessionId)) {
            this.streams.delete(sessionId);
            this.logger.log(`Deleted stream: ${sessionId}`);
        }
    }

    // Основной метод для добавления аудиоданных в очередь нужного потока
    public async streamAudio(sessionId: string, outputBuffer: Buffer) {
        const stream = this.streams.get(sessionId);
        if (!stream) {
            this.logger.error(`Stream ${sessionId} not found`);
            return;
        }

        stream.state.bufferQueue.push(outputBuffer);
        if (!stream.state.isSending) {
            stream.state.isSending = true;
            await this.processBufferQueue(sessionId);
        }
    }

    // Обработка очереди буферов для конкретного потока
    private async processBufferQueue(sessionId: string) {
        const stream = this.streams.get(sessionId);
        if (!stream) return;

        while (stream.state.bufferQueue.length > 0) {
            const currentBuffer = stream.state.bufferQueue.shift()!;
            await this.sendBuffer(sessionId, currentBuffer);
        }
        stream.state.isSending = false;
    }

    // Разбиение буфера на пакеты и их отправка с учётом тайминга
    private async sendBuffer(sessionId: string, buffer: Buffer) {
        const stream = this.streams.get(sessionId);
        if (!stream) return;
        let offset = 0;
        const startTime = Date.now();
        const packetSize = 160;         // Размер одного пакета (в байтах)
        const packetDurationMs = 20;      // Интервал отправки пакетов (мс)
        const timestampIncrement = 160;   // Приращение timestamp для каждого пакета
        const { external_local_Address, external_local_Port } = stream.data;

        while (offset < buffer.length) {
            const chunk = buffer.subarray(offset, offset + packetSize);
            const rtpPacket = this.buildRTPPacket(
                chunk,
                stream.state.seq,
                stream.state.timestamp,
                this.RTP_SSRC, // Можно задать отдельный RTP SSRC
                0x00 // Тип полезной нагрузки (например, для U-Law G.711)
            );

            const packetIndex = offset / packetSize;
            const targetTime = startTime + packetIndex * packetDurationMs;
            const delay = Math.max(0, targetTime - Date.now());
            await new Promise(resolve => setTimeout(resolve, delay));

            this.server.send(rtpPacket, external_local_Port, external_local_Address, (err) => {
                if (err) this.logger.error(`Error sending RTP-packet: ${err}`);
            });

            // Обновляем состояние для следующего пакета
            stream.state.seq = (stream.state.seq + 1) & 0xffff;
            stream.state.timestamp += timestampIncrement;
            offset += packetSize;
        }
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

    async convertAndStreamPCM(inputBuffer, serverData: StreamData) {

        // const resampled = this.audioService.resamplePCM(
        //     inputBuffer,
        //     24000,
        //     8000,
        //     {bitDepth: 16, numChannels: 1}
        // );

        //const resampledBuffer = mulaw.encodeBuffer(resampled)
        const resampledBuffer = mulaw.encodeBuffer(inputBuffer)

        let seq = this.SEQ_START;
        let timestamp = 0;
        const packetSize = 160; // 16000 * 0.02 * 2 bytes
        const packetDurationMs = 20; // Интервал отправки (соответствует 160 байтам)
        const timestamp_inc = 160;     // 16000 * 20ms / 1000

        let i = 0;

        const sendPacket = (scheduledTime = Date.now()) => {
            if (i >= resampledBuffer.length) {
                console.log('RTP stream sent on ' + `${serverData.external_local_Address}:${serverData.external_local_Port}`);
                return;
            }

            const chunk = resampledBuffer.subarray(i, i + packetSize);
            const rtpPacket = this.buildRTPPacket(
                chunk,
                seq,
                timestamp,
                this.RTP_SSRC,
                0x00 // Payload Type для U-Law G.711
            );

            this.server.send(rtpPacket, serverData.external_local_Port, serverData.external_local_Address, (err) => {
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

}
