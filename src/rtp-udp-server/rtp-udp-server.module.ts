import { Module } from '@nestjs/common';
import { RtpUdpServerService } from './rtp-udp-server.service';
import { OpenAiService } from "../open-ai/open-ai.service";
import { VoskServerService } from "../vosk-server/vosk-server.service";
import { AudioService } from "../audio/audio.service";


@Module({
  providers: [
    RtpUdpServerService,
    OpenAiService,

    //    VoskServerService,
    AudioService,
  ],
  exports: [RtpUdpServerService]
})
export class RtpUdpServerModule { }
