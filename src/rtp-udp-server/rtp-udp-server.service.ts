import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private startingStream: boolean = false
    private writeStream: fs.WriteStream;
    private readonly swap16 = true;

    constructor(
        private openAi: OpenAiService,
        private vosk: VoskServerService
    ) {}

    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        const audioDir = path.join(__dirname, '..', 'audio_files');
        if (!fs.existsSync(audioDir)) {
            fs.mkdirSync(audioDir);
        }
        const filePath = path.join(audioDir, `audio_${Date.now()}.raw`);

        this.writeStream = fs.createWriteStream(filePath);

        this.server.on('message', async (msg, rinfo) => {

            if(!this.startingStream) {
                console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
                this.startingStream = true;
            }

            try {
                let buf: Buffer = msg.slice(12); // Убираем 12-байтовый RTP-заголовок
                if (this.swap16) {
                     buf.swap16()
                }

                this.writeStream.write(buf);
                // this.server.emit('data', msg);
                await this.vosk.audioAppend(buf)
                // await this.openAi.audioAppend(buf)
            } catch (error) {
                console.error(`Error processing RTP packet: ${error}`);
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

    onHangup() {
        console.log('Closing RTP file stream...');
        this.server.close();
    }

}
