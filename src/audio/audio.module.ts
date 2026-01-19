import { Module } from '@nestjs/common';
import { StreamAudioService } from './streamAudio.service';
import { AudioService } from './audio.service';

@Module({
  providers: [StreamAudioService, AudioService],
  exports: [StreamAudioService, AudioService]
})

export class AudioModule { }
