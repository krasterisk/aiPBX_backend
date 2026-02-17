import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetAnalyticsDashboardDto {
    @ApiProperty({
        example: '1',
        description: 'User ID filter',
        required: false
    })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    userId?: string;

    @ApiProperty({
        example: '1,2,3',
        description: 'Assistant ID filter (comma-separated for multiple)',
        required: false
    })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    assistantId?: string;

    @ApiProperty({
        example: '2026-01-01',
        description: 'Start date (YYYY-MM-DD)',
        required: false
    })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    startDate?: string;

    @ApiProperty({
        example: '2026-02-08',
        description: 'End date (YYYY-MM-DD)',
        required: false
    })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    endDate?: string;

    @ApiProperty({
        example: 'call',
        description: 'Source filter: call, widget, playground',
        required: false
    })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    source?: string;
}

// Агрегированные метрики
export interface AggregatedMetrics {
    // Точность и эффективность (NLU)
    avgIntentRecognitionRate: number;
    avgEntityExtractionRate: number;
    dialogCompletionRate: number;
    avgContextRetentionScore: number;
    avgTurns: number;

    // Качество речи и взаимодействия
    avgWerEstimated: number;
    avgResponseLatencyScore: number;
    avgMos: number;
    selfRecoveryRate: number;

    // Бизнес-метрики
    escalationRate: number;
    automationRate: number;
    avgCostSavingsEstimated: number;

    // Удовлетворённость
    avgCsat: number;
    sentimentDistribution: {
        positive: number;
        neutral: number;
        negative: number;
    };
    frustrationDetectedRate: number;
    bailOutRate: number;
}

// Данные по периодам (для графиков)
export interface TimeSeriesData {
    label: string;              // Дата/период
    callsCount: number;         // Количество звонков
    avgCsat: number;            // Средний CSAT
    avgMos: number;             // Средний MOS
    automationRate: number;     // Процент автоматизации
    totalCost: number;          // Общая стоимость
    totalTokens: number;        // Общее количество токенов
}

// Распределение по ассистентам
export interface AssistantMetrics {
    assistantId: string;
    assistantName: string;
    callsCount: number;
    avgCsat: number;
    automationRate: number;
    totalCost: number;
}

// Топ-проблем (fallback intents)
export interface TopIssues {
    intent: string;
    count: number;
}

// Итоговый ответ дашбоарда
export interface AnalyticsDashboardResponse {
    // Общая статистика
    totalCalls: number;
    totalCost: number;
    totalTokens: number;

    // Агрегированные метрики
    metrics: AggregatedMetrics;

    // Временные ряды для графиков
    timeSeries: TimeSeriesData[];

    // Метрики по ассистентам
    assistantMetrics: AssistantMetrics[];

    // Топ проблемных сценариев
    topIssues: TopIssues[];
}
