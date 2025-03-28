import { Module } from '@nestjs/common';
import {StreamAudioService} from "./streamAudio.service";

@Module({
  providers: [StreamAudioService]
})

export class AudioModule {}
