import { forwardRef, Module } from '@nestjs/common';
import { PbxServersController } from './pbx-servers.controller';
import { PbxServersService } from "./pbx-servers.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { PbxServers } from "./pbx-servers.model";
import { AuthModule } from "../auth/auth.module";
import { HttpModule } from "@nestjs/axios";
import { Assistant } from "../assistants/assistants.model";
import { SipAccounts } from "./sip-accounts.model";
import { AriModule } from "../ari/ari.module";

@Module({
  controllers: [PbxServersController],
  providers: [PbxServersService],
  imports: [
    SequelizeModule.forFeature([PbxServers, Assistant, SipAccounts]),
    forwardRef(() => AuthModule),
    forwardRef(() => AriModule),
    HttpModule
  ],
  exports: [PbxServersService]
})
export class PbxServersModule { }
