import { forwardRef, Module } from '@nestjs/common';
import { SipTrunksController } from './sip-trunks.controller';
import { SipTrunksService } from "./sip-trunks.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { SipTrunks } from "./sip-trunks.model";
import { PbxServers } from "../pbx-servers/pbx-servers.model";
import { Assistant } from "../assistants/assistants.model";
import { AuthModule } from "../auth/auth.module";
import { HttpModule } from "@nestjs/axios";

@Module({
    controllers: [SipTrunksController],
    providers: [SipTrunksService],
    imports: [
        SequelizeModule.forFeature([SipTrunks, PbxServers, Assistant]),
        forwardRef(() => AuthModule),
        HttpModule,
    ],
    exports: [SipTrunksService],
})
export class SipTrunksModule { }
