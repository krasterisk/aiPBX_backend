import {forwardRef, Module} from '@nestjs/common';
import { AriController } from './ari.controller';
import { AriService } from './ari.service';
import {AuthModule} from "../auth/auth.module";
import {WsServerModule} from "../ws-server/ws-server.module";
import {RtpUdpServerModule} from "../rtp-udp-server/rtp-udp-server.module";

@Module({
  controllers: [AriController],
  providers: [AriService],
  imports: [
    forwardRef(() => AuthModule),
      WsServerModule,
      RtpUdpServerModule
  ]
})
export class AriModule {}
