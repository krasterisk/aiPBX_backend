import { forwardRef, Module } from '@nestjs/common';
import { PbxServersController } from './pbx-servers.controller';
import { PbxServersService } from "./pbx-servers.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { PbxServers } from "./pbx-servers.model";
import { AuthModule } from "../auth/auth.module";
import { SipAccounts } from "./sip-accounts.model";
import { HttpModule } from "@nestjs/axios";
import { Assistant } from "../assistants/assistants.model";

@Module({
  controllers: [PbxServersController],
  providers: [PbxServersService],
  imports: [
    SequelizeModule.forFeature([PbxServers, SipAccounts, Assistant]),
    forwardRef(() => AuthModule),
    HttpModule
  ],
  exports: [PbxServersService]
})
export class PbxServersModule { }
