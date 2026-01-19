import { Module } from '@nestjs/common';
import { PlaygroundController } from './playground.controller';
import { PlaygroundService } from './playground.service';
import { OpenAiModule } from '../open-ai/open-ai.module';
import { AssistantsModule } from '../assistants/assistants.module';
import { AudioModule } from '../audio/audio.module';
import { WsServerModule } from '../ws-server/ws-server.module';

@Module({
    imports: [OpenAiModule, AssistantsModule, AudioModule, WsServerModule],
    controllers: [PlaygroundController],
    providers: [PlaygroundService],
    exports: [PlaygroundService]
})
export class PlaygroundModule { }
