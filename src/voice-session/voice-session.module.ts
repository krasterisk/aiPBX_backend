import { Module } from '@nestjs/common';
import { ApiKeyModule } from '../api-keys/api-key.module';
import { AssistantsModule } from '../assistants/assistants.module';
import { AudioModule } from '../audio/audio.module';
import { NonRealtimeModule } from '../non-realtime/non-realtime.module';
import { VoiceSessionGateway } from './voice-session.gateway';
import { VoiceSessionService } from './voice-session.service';

@Module({
    imports: [ApiKeyModule, AssistantsModule, AudioModule, NonRealtimeModule],
    providers: [VoiceSessionService, VoiceSessionGateway],
})
export class VoiceSessionModule {}
