import { Module } from '@nestjs/common';
import { RtpUdpServerService } from './rtp-udp-server.service';
import {OpenAiService} from "../open-ai/open-ai.service";
import {VoskServerService} from "../vosk-server/vosk-server.service";
import {AudioResampleService} from "../audio-resample/audio-resample.service";
import {AudioStreamRTPService} from "../audio-stream/audio-stream.service";

@Module({
  providers: [
    RtpUdpServerService,
    OpenAiService,
    VoskServerService,
    AudioResampleService
  ],
  exports: [RtpUdpServerService]
})
export class RtpUdpServerModule {}
