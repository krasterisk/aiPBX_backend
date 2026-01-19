import { forwardRef, Module } from '@nestjs/common';
import { AriController } from './ari.controller';
import { AriService } from './ari.service';
import { AuthModule } from "../auth/auth.module";

import { AudioModule } from "../audio/audio.module";
import { RtpUdpServerService } from "../rtp-udp-server/rtp-udp-server.service";
import { WsServerGateway } from "../ws-server/ws-server.gateway";
import { AssistantsModule } from "../assistants/assistants.module";
import { AiCdrModule } from "../ai-cdr/ai-cdr.module";
import { AiToolsHandlersModule } from "../ai-tools-handlers/ai-tools-handlers.module";
import { PbxServersModule } from "../pbx-servers/pbx-servers.module";
import { ConfigModule } from "@nestjs/config";
import { OpenAiModule } from "../open-ai/open-ai.module";


@Module({
    controllers: [AriController],
    providers: [
        RtpUdpServerService,
        WsServerGateway,
        AriService,
    ],
    imports: [
        ConfigModule,
        OpenAiModule,
        AudioModule,
        forwardRef(() => AuthModule),
        AssistantsModule,
        AiCdrModule,
        AiToolsHandlersModule,
        PbxServersModule
    ]
})
export class AriModule {
}
