import { Module } from '@nestjs/common';
import {AiToolsHandlersService} from "./ai-tools-handlers.service";
import {AiToolsModule} from "../ai-tools/ai-tools.module";
import {HttpModule} from "@nestjs/axios";
import {KnowledgeModule} from "../knowledge/knowledge.module";

@Module({
    imports: [AiToolsModule, HttpModule, KnowledgeModule],
    providers: [AiToolsHandlersService],
    exports: [AiToolsHandlersService]
})
export class AiToolsHandlersModule {}
