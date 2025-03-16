import { Module } from '@nestjs/common';
import { AudioResampleService } from './audio-resample.service';

@Module({
  providers: [AudioResampleService]
})

export class AudioResampleModule {}
