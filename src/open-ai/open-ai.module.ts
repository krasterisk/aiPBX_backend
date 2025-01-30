import { forwardRef, Module } from "@nestjs/common";
import { OpenAiService } from './open-ai.service';
import { SequelizeModule } from "@nestjs/sequelize";
import { App } from "../pbx/apps/app.model";
import { AuthModule } from "../auth/auth.module";
import { OpenAiController } from "./open-ai.controller";

@Module({
  providers: [OpenAiService],
  controllers: [OpenAiController],
  imports: [
    forwardRef(() => AuthModule)
  ]
})
export class OpenAiModule {}
