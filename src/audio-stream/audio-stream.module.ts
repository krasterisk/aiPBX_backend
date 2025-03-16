import { Module } from '@nestjs/common';
import { AudioStreamRTPService } from './audio-stream.service';

@Module({
  providers: [AudioStreamRTPService]
})

export class AudioStreamModule {}
