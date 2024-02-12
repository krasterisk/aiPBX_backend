import {forwardRef, Module} from '@nestjs/common';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Provisioning} from "./provisioning.model";

@Module({
  providers: [ProvisioningService],
  controllers: [ProvisioningController],
  imports: [
    SequelizeModule.forFeature([Provisioning]),
    forwardRef(() => AuthModule)
  ],

})
export class ProvisioningModule {}
