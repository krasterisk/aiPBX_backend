import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AiToolsHandlersModule } from '../ai-tools-handlers/ai-tools-handlers.module';
import { AiToolsModule } from '../ai-tools/ai-tools.module';
import { AssistantsModule } from '../assistants/assistants.module';

@Module({
    imports: [
        AiToolsHandlersModule,
        AiToolsModule,
        AssistantsModule,
    ],
    controllers: [ChatController],
    providers: [ChatService],
    exports: [ChatService],
})
export class ChatModule {}
