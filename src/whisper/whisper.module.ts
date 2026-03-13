import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhisperService } from './whisper.service';
import { WhisperController } from './whisper.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [HttpModule, ConfigModule, AuthModule],
    controllers: [WhisperController],
    providers: [WhisperService],
    exports: [WhisperService],
})
export class WhisperModule {}
