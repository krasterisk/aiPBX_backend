import {forwardRef, Module} from '@nestjs/common';
import { RtpUdpServerService } from './rtp-udp-server.service';
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import {AudioService} from "../audio/audio.service";
import {EventEmitter2} from "@nestjs/event-emitter";
import {StreamAudioService} from "../audio/streamAudio.service";
import dgram from "dgram";
const udpSocket = dgram.createSocket('udp4');

@Module({
  providers: [
    RtpUdpServerService,
      OpenAiService,
//    VoskServerService,
      AudioService,
      EventEmitter2,
    {
      provide: StreamAudioService,
      useFactory: (audioService: AudioService) => {
        return new StreamAudioService(udpSocket);
      }
    }
  ],
  exports: [RtpUdpServerService]
})
export class RtpUdpServerModule {}
