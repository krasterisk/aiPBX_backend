import { forwardRef, Module } from '@nestjs/common';
import { AiCdrController } from './ai-cdr.controller';
import { AiCdrService } from "./ai-cdr.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthModule } from "../auth/auth.module";
import { AiCdr } from "./ai-cdr.model";
import { AiEvents } from "./ai-events.model";
import { Prices } from "../prices/prices.model";
import { UsersModule } from "../users/users.module";
import { Assistant } from '../assistants/assistants.model';
import { SipAccounts } from '../pbx-servers/sip-accounts.model';

@Module({
  controllers: [AiCdrController],
  providers: [AiCdrService],
  imports: [
    SequelizeModule.forFeature([AiCdr, AiEvents, Prices, Assistant, SipAccounts]),
    forwardRef(() => AuthModule),
    UsersModule
  ],
  exports: [AiCdrService],
})
export class AiCdrModule { }
