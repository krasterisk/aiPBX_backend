import { forwardRef, Module } from '@nestjs/common';
import { AiAnalyticsService } from './ai-analytics.service';
import { AiAnalyticsController } from './ai-analytics.controller';
import { SequelizeModule } from "@nestjs/sequelize";
import { AiAnalytics } from "./ai-analytics.model";
import { AiCdrModule } from "../ai-cdr/ai-cdr.module";
import { OpenAiModule } from "../open-ai/open-ai.module";
import { AiCdr } from "../ai-cdr/ai-cdr.model";
import { BillingModule } from "../billing/billing.module";
import { AuthModule } from "../auth/auth.module";

@Module({
    providers: [AiAnalyticsService],
    controllers: [AiAnalyticsController],
    imports: [
        SequelizeModule.forFeature([AiAnalytics, AiCdr]),
        BillingModule,
        forwardRef(() => AiCdrModule),
        forwardRef(() => OpenAiModule),
        forwardRef(() => AuthModule),
    ],
    exports: [AiAnalyticsService]
})
export class AiAnalyticsModule { }
