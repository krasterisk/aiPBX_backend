import { Module } from '@nestjs/common';
import { VoskServerService } from './vosk-server.service';

@Module({
  providers: [VoskServerService],
  exports: [VoskServerService]
})
export class VoskServerModule {}
