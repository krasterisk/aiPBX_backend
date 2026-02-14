import { forwardRef, Module } from '@nestjs/common';
import { AiTool } from "./ai-tool.model";
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthModule } from "../auth/auth.module";
import { AssistantToolsModel } from "./assistant-tools.model";
import { Assistant } from "../assistants/assistants.model";
import { AiToolsService } from "./ai-tools.service";
import { AiToolsController } from "./ai-tools.controller";
import { LoggerModule } from "../logger/logger.module";

@Module({
    providers: [AiToolsService],
    controllers: [AiToolsController],
    imports: [
        SequelizeModule.forFeature([AiTool, Assistant, AssistantToolsModel]),
        forwardRef(() => AuthModule),
        LoggerModule,
    ],
    exports: [AiToolsService]
})
export class AiToolsModule { }
