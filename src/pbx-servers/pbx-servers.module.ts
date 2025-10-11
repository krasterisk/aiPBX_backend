 import {forwardRef, Module} from '@nestjs/common';
import { PbxServersController } from './pbx-servers.controller';
 import {PbxServersService} from "./pbx-servers.service";
 import {SequelizeModule} from "@nestjs/sequelize";
 import {PbxServers} from "./pbx-servers.model";
 import {AuthModule} from "../auth/auth.module";

@Module({
  controllers: [PbxServersController],
  providers: [PbxServersService],
  imports: [
    SequelizeModule.forFeature([PbxServers]),
      forwardRef(() => AuthModule)
  ],
    exports: [PbxServersService]
})
export class PbxServersModule {}
