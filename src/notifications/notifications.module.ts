import {forwardRef, Module} from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {Notifications} from "./notifications.model";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  imports: [
    SequelizeModule.forFeature([Notifications]),
    forwardRef(() => AuthModule)
  ]
})
export class NotificationsModule {}
