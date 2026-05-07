import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { HttpModule } from '@nestjs/axios';
import { Chat } from './chat.model';
import { ChatToolsModel } from './chat-tools.model';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AiToolsHandlersModule } from '../ai-tools-handlers/ai-tools-handlers.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyModule } from '../api-keys/api-key.module';

@Module({
    imports: [
        SequelizeModule.forFeature([Chat, ChatToolsModel]),
        HttpModule.register({
            timeout: 20_000,
            maxRedirects: 3,
        }),
        AiToolsHandlersModule,
        AuthModule,
        ApiKeyModule,
    ],
    controllers: [ChatController],
    providers: [ChatService],
    exports: [ChatService],
})
export class ChatModule {}
