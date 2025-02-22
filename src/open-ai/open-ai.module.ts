import { forwardRef, Module } from "@nestjs/common";
import { OpenAiService } from './open-ai.service';
import { AuthModule } from "../auth/auth.module";
import { OpenAiController } from "./open-ai.controller";

@Module({
  providers: [OpenAiService],
  controllers: [OpenAiController],
  imports: [
    forwardRef(() => AuthModule)
  ],
  exports: [OpenAiService]
})
export class OpenAiModule {}
