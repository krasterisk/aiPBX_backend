import { Module } from '@nestjs/common';
import { RtpUdpServerService } from './rtp-udp-server.service';
import {OpenAiService} from "../open-ai/open-ai.service";
import {OpenAiModule} from "../open-ai/open-ai.module";

@Module({
  providers: [RtpUdpServerService, OpenAiService],
  exports: [RtpUdpServerService]
})
export class RtpUdpServerModule {}
