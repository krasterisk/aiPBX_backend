import {forwardRef, Module} from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Webhook} from "./webhook.model";

@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  imports: [
    SequelizeModule.forFeature([Webhook]),
    forwardRef(() => AuthModule)
  ],
})
export class WebhooksModule {}
