import { forwardRef, Module } from '@nestjs/common';
import { AiCdrController } from './ai-cdr.controller';
import { AiCdrService } from "./ai-cdr.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthModule } from "../auth/auth.module";
import { AiCdr } from "./ai-cdr.model";
import { AiEvents } from "./ai-events.model";
import { BillingModule } from "../billing/billing.module";
import { Assistant } from '../assistants/assistants.model';
import { SipAccounts } from '../pbx-servers/sip-accounts.model';
import { AiAnalyticsModule } from "../ai-analytics/ai-analytics.module";
import { AiAnalytics } from "../ai-analytics/ai-analytics.model";
import { BillingRecord } from "../billing/billing-record.model";
import { OperatorAnalytics } from "../operator-analytics/operator-analytics.model";

@Module({
  controllers: [AiCdrController],
  providers: [AiCdrService],
  imports: [
    SequelizeModule.forFeature([AiCdr, AiEvents, Assistant, SipAccounts, OperatorAnalytics, AiAnalytics, BillingRecord]),
    forwardRef(() => AuthModule),
    forwardRef(() => AiAnalyticsModule),
    BillingModule
  ],
  exports: [AiCdrService],
})
export class AiCdrModule { }
