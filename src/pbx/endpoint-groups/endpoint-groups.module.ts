import {forwardRef, Module} from '@nestjs/common';
import { EndpointGroupsController } from './endpoint-groups.controller';
import { EndpointGroupsService } from './endpoint-groups.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {EndpointGroups} from "./endpoint-groups.model";

@Module({
  controllers: [EndpointGroupsController],
  providers: [EndpointGroupsService],
  imports: [
    SequelizeModule.forFeature([EndpointGroups]),
    forwardRef(() => AuthModule)
  ],
  exports: [
      EndpointGroupsService
  ]
})
export class EndpointGroupsModule {}
