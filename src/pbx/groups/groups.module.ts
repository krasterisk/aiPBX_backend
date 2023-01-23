import {forwardRef, Module} from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Group} from "./group.model";

@Module({
  controllers: [GroupsController],
  providers: [GroupsService],
  imports: [
    SequelizeModule.forFeature([Group]),
    forwardRef(() => AuthModule)
  ],
})
export class GroupsModule {}
