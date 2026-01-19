import { forwardRef, Module } from "@nestjs/common";
import { OpenAiService } from './open-ai.service';
import { AuthModule } from "../auth/auth.module";
import { OpenAiController } from "./open-ai.controller";
import { WsServerModule } from "../ws-server/ws-server.module";
import { AiCdrModule } from "../ai-cdr/ai-cdr.module";
import { AiToolsHandlersModule } from "../ai-tools-handlers/ai-tools-handlers.module";
import { ConfigModule } from "@nestjs/config";

@Module({
  controllers: [OpenAiController],
  providers: [OpenAiService],
  imports: [
    WsServerModule,
    forwardRef(() => AuthModule),
    AiCdrModule,
    AiToolsHandlersModule,
    ConfigModule,
  ],
  exports: [OpenAiService]
})

export class OpenAiModule { }
