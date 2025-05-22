import { Module } from '@nestjs/common';
import {AiToolsHandlersService} from "./ai-tools-handlers.service";
import {AiToolsModule} from "../ai-tools/ai-tools.module";
import {HttpModule} from "@nestjs/axios";

@Module({
    imports: [AiToolsModule, HttpModule],
    providers: [AiToolsHandlersService],
    exports: [AiToolsHandlersService]
})
export class AiToolsHandlersModule {}
