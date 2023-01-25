import {forwardRef, Module} from '@nestjs/common';
import { QueueMembersController } from './queue_members.controller';
import {QueueMembersService} from "./queue_members.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {QueueMembers} from "./queue_members.model";

@Module({
  controllers: [QueueMembersController],
  providers: [QueueMembersService],
  imports: [
    SequelizeModule.forFeature([QueueMembers]),
    forwardRef(() => AuthModule)
  ],
})
export class QueueMembersModule {}
