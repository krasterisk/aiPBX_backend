import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule } from '@nestjs/config';
import { OperatorAnalyticsController } from './operator-analytics.controller';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorAnalytics } from './operator-analytics.model';
import { OperatorApiToken } from './operator-api-token.model';
import { OperatorProject } from './operator-project.model';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { ExternalSttProvider } from './providers/external-stt.provider';
import { ApiTokenGuard } from './guards/api-token.guard';
import { Prices } from '../prices/prices.model';
import { User } from '../users/users.model';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';

@Module({
    imports: [
        SequelizeModule.forFeature([OperatorAnalytics, OperatorApiToken, OperatorProject, Prices, User, AiCdr, AiAnalytics, BillingRecord]),
        ConfigModule,
        UsersModule,
        AuthModule,
    ],
    controllers: [OperatorAnalyticsController],
    providers: [
        OperatorAnalyticsService,
        OpenAiTranscriptionProvider,
        ExternalSttProvider,
        ApiTokenGuard,
    ],
    exports: [OperatorAnalyticsService],
})
export class OperatorAnalyticsModule { }
