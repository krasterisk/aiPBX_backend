import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ConfigModule } from '@nestjs/config';
import { OperatorAnalyticsController } from './operator-analytics.controller';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorRetentionTask } from './operator-retention.task';
import { OperatorAnomalyTask } from './operator-anomaly.task';
import { OperatorStuckReaperTask } from './operator-stuck-reaper.task';
import { OperatorAnalytics } from './operator-analytics.model';
import { OperatorApiToken } from './operator-api-token.model';
import { OperatorProject } from './operator-project.model';
import { MetricValue } from './operator-metric-value.model';
import { MetricOverride } from './operator-metric-override.model';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { ExternalSttProvider } from './providers/external-stt.provider';
import { ApiTokenGuard } from './guards/api-token.guard';
import { Prices } from '../prices/prices.model';
import { User } from '../users/users.model';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { WhisperModule } from '../whisper/whisper.module';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';
import { BillingModule } from '../billing/billing.module';

@Module({
    imports: [
        SequelizeModule.forFeature([OperatorAnalytics, OperatorApiToken, OperatorProject, MetricValue, MetricOverride, Prices, User, AiCdr, AiAnalytics, BillingRecord]),
        ConfigModule,
        UsersModule,
        AuthModule,
        WhisperModule,
        BillingModule,
    ],
    controllers: [OperatorAnalyticsController],
    providers: [
        OperatorAnalyticsService,
        OperatorRetentionTask,
        OperatorAnomalyTask,
        OperatorStuckReaperTask,
        OpenAiTranscriptionProvider,
        ExternalSttProvider,
        ApiTokenGuard,
    ],
    exports: [OperatorAnalyticsService],
})
export class OperatorAnalyticsModule { }
