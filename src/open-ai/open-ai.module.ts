import { forwardRef, Module } from "@nestjs/common";
import { OpenAiService } from './open-ai.service';
import { AuthModule } from "../auth/auth.module";
import { OpenAiController } from "./open-ai.controller";
import { WsServerModule } from "../ws-server/ws-server.module";
import { AiCdrModule } from "../ai-cdr/ai-cdr.module";
import { AiToolsHandlersModule } from "../ai-tools-handlers/ai-tools-handlers.module";
import { ConfigModule } from "@nestjs/config";
import { UsersModule } from "../users/users.module";
import { AudioModule } from "../audio/audio.module";

@Module({
  controllers: [OpenAiController],
  providers: [OpenAiService],
  imports: [
    WsServerModule,
    UsersModule,
    forwardRef(() => AuthModule),
    AiCdrModule,
    AiToolsHandlersModule,
    ConfigModule,
    AudioModule
  ],
  exports: [OpenAiService]
})

export class OpenAiModule { }
