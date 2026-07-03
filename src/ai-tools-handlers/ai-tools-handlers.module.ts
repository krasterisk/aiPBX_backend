import { Module, forwardRef } from '@nestjs/common';
import {AiToolsHandlersService} from "./ai-tools-handlers.service";
import {AiToolsModule} from "../ai-tools/ai-tools.module";
import {HttpModule} from "@nestjs/axios";
import {KnowledgeModule} from "../knowledge/knowledge.module";
import {HelpdeskModule} from "../helpdesk/helpdesk.module";

@Module({
    imports: [AiToolsModule, HttpModule, KnowledgeModule, forwardRef(() => HelpdeskModule)],
    providers: [AiToolsHandlersService],
    exports: [AiToolsHandlersService]
})
export class AiToolsHandlersModule {}
