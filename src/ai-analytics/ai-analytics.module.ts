import { forwardRef, Module } from '@nestjs/common';
import { AiAnalyticsService } from './ai-analytics.service';
import { AiAnalyticsController } from './ai-analytics.controller';
import { SequelizeModule } from "@nestjs/sequelize";
import { AiAnalytics } from "./ai-analytics.model";
import { AiCdrModule } from "../ai-cdr/ai-cdr.module";
import { OpenAiModule } from "../open-ai/open-ai.module";
import { Prices } from "../prices/prices.model";
import { AiCdr } from "../ai-cdr/ai-cdr.model";
import { UsersModule } from "../users/users.module";
import { AuthModule } from "../auth/auth.module";

@Module({
    providers: [AiAnalyticsService],
    controllers: [AiAnalyticsController],
    imports: [
        SequelizeModule.forFeature([AiAnalytics, Prices, AiCdr]),
        UsersModule,
        forwardRef(() => AiCdrModule),
        forwardRef(() => OpenAiModule),
        forwardRef(() => AuthModule),
    ],
    exports: [AiAnalyticsService]
})
export class AiAnalyticsModule { }
