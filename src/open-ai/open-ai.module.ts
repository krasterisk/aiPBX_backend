import { forwardRef, Module } from "@nestjs/common";
import { OpenAiService } from './open-ai.service';
import { AuthModule } from "../auth/auth.module";
import { OpenAiController } from "./open-ai.controller";

@Module({
  controllers: [OpenAiController],
  providers: [OpenAiService],
  imports: [
    forwardRef(() => AuthModule)
  ]
})

export class OpenAiModule {}
