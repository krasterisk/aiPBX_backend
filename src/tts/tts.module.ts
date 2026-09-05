import { Module } from '@nestjs/common';
import { ApiKeyModule } from '../api-keys/api-key.module';
import { OmniVoiceTtsProvider } from '../non-realtime/tts/omnivoice-tts.provider';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
    imports: [ApiKeyModule],
    controllers: [TtsController],
    providers: [
        {
            provide: OmniVoiceTtsProvider,
            useFactory: () => new OmniVoiceTtsProvider(process.env.OMNIVOICE_TTS_URL),
        },
        TtsService,
    ],
})
export class TtsModule {}
