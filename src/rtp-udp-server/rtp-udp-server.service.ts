import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import * as dgram from "dgram";
import {OpenAiService} from "../open-ai/open-ai.service";

@Injectable()
export class RtpUdpServerService implements OnModuleDestroy, OnModuleInit {
    private readonly PORT = 3032;
    private server: dgram.Socket;
    private startingStream: boolean = false

    constructor(
        private openAi: OpenAiService
    ) {}

    onModuleInit() {
        this.server = dgram.createSocket('udp4');

        this.server.on('message', async (msg, rinfo) => {

            if(!this.startingStream) {
                console.log(`Received ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
                this.startingStream = true;
            }

            try {
                this.openAi.audioAppend(msg)
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
    }

    onHangup() {
        console.log('Closing RTP file stream...');
        this.server.close();
    }

}
