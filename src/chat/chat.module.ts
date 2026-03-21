import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Chat } from './chat.model';
import { ChatToolsModel } from './chat-tools.model';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AiToolsHandlersModule } from '../ai-tools-handlers/ai-tools-handlers.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        SequelizeModule.forFeature([Chat, ChatToolsModel]),
        AiToolsHandlersModule,
        AuthModule,
    ],
    controllers: [ChatController],
    providers: [ChatService],
    exports: [ChatService],
})
export class ChatModule {}
