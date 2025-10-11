import {forwardRef, Module} from '@nestjs/common';
import {AriController} from './ari.controller';
import {AriService} from './ari.service';
import {AuthModule} from "../auth/auth.module";
import {OpenAiService} from "../open-ai/open-ai.service";
import {StreamAudioService} from "../audio/streamAudio.service";
import {AudioService} from "../audio/audio.service";
import dgram from "dgram";
import {RtpUdpServerService} from "../rtp-udp-server/rtp-udp-server.service";
import {WsServerGateway} from "../ws-server/ws-server.gateway";
import {AssistantsModule} from "../assistants/assistants.module";
import {AiCdrModule} from "../ai-cdr/ai-cdr.module";
import {AiToolsHandlersModule} from "../ai-tools-handlers/ai-tools-handlers.module";
import {PbxServersModule} from "../pbx-servers/pbx-servers.module";
const udpSocket = dgram.createSocket('udp4');

@Module({
    controllers: [AriController],
    providers: [
        RtpUdpServerService,
        WsServerGateway,
        AudioService,
        AriService,
        OpenAiService,
        {
            provide: StreamAudioService,
            useFactory: (audioService: AudioService) => {
                return new StreamAudioService(udpSocket, audioService);
            },
            inject: [AudioService]
        }
    ],
    imports: [
        forwardRef(() => AuthModule),
        AssistantsModule,
        AiCdrModule,
        AiToolsHandlersModule,
        PbxServersModule
    ]
})
export class AriModule {
}
