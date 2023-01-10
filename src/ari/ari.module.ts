import { Module } from '@nestjs/common';
import { AriController } from './ari.controller';
import { AriService } from './ari.service';

@Module({
  controllers: [AriController],
  providers: [AriService]
})
export class AriModule {}
