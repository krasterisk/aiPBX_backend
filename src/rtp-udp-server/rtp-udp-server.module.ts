import { Module } from '@nestjs/common';
import { RtpUdpServerService } from './rtp-udp-server.service';
import { OpenAiService } from "../open-ai/open-ai.service";
import { AudioService } from "../audio/audio.service";
import { NonRealtimeModule } from "../non-realtime/non-realtime.module";


@Module({
  imports: [NonRealtimeModule],
  providers: [
    RtpUdpServerService,
    OpenAiService,

    //    VoskServerService,
    AudioService,
  ],
  exports: [RtpUdpServerService]
})
export class RtpUdpServerModule { }
