import { forwardRef, Inject, Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { AiAnalytics } from "./ai-analytics.model";
import { AiCdrService } from "../ai-cdr/ai-cdr.service";
import { OpenAiService } from "../open-ai/open-ai.service";

import { AiCdr } from "../ai-cdr/ai-cdr.model";
import { BillingService } from "../billing/billing.service";
import { Op } from "sequelize";
import { AnalyticsMetrics } from "./interfaces/analytics-metrics.interface";

@Injectable()
export class AiAnalyticsService {
    private readonly logger = new Logger(AiAnalyticsService.name);

    constructor(
        @InjectModel(AiAnalytics) private aiAnalyticsRepository: typeof AiAnalytics,
        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,
        private readonly billingService: BillingService,
        @Inject(forwardRef(() => AiCdrService)) private readonly aiCdrService: AiCdrService,
        @Inject(forwardRef(() => OpenAiService)) private readonly openAiService: OpenAiService,
    ) { }

    async analyzeCall(channelId: string) {
        this.logger.log(`Starting analysis for channelId: ${channelId}`);
        try {
            const dialog = await this.aiCdrService.getDialogs(channelId);

            if (!dialog || dialog.length < 2) {
                this.logger.warn(`Dialog too short for analysis: ${channelId}`);
                return;
            }

            const prompt = `
You are a senior UX copywriter and product marketer. Your task is to analyze the dialogue between the AI assistant and the user and generate a JSON report with metrics.

Input data is the conversation history:
${JSON.stringify(dialog)}

Analyze the dialogue according to the following criteria and return a JSON object with EXACTLY this structure:

{
  "accuracy_and_efficiency": {
    "intent_recognition_rate": <0-100>,
    "entity_extraction_rate": <0-100>,
    "dialog_completion_rate": <0 or 1>,
    "context_retention_score": <0-100>,
    "average_turns": <int>
  },
  "speech_and_interaction_quality": {
    "wer_estimated": <0-100>,
    "response_latency_score": <0-100>,
    "mos": <1-5>,
    "self_recovery_rate": <0 or 1>
  },
  "business_impact": {
    "escalation_rate": <0 or 1>,
    "automation_rate": <0 or 1>,
    "cost_savings_estimated": <float>
  },
  "user_satisfaction": {
    "csat": <1-100>,
    "sentiment": "<Positive|Neutral|Negative>",
    "frustration_detected": <boolean>,
    "bail_out_rate": <boolean>
  },
  "scenario_analysis": {
    "top_fallback_intents": [<list of strings>],
    "escalation_reason": "<string>",
    "success": <boolean>,
    "summary": "<string>"
  }
}

Field descriptions:
1. accuracy_and_efficiency:
   - intent_recognition_rate: How accurately the AI identified the user's intent
   - entity_extraction_rate: Accuracy of extracting key data (names, dates, amounts)
   - dialog_completion_rate: Whether the dialogue was completed without escalation (0 or 1)
   - context_retention_score: Ability to maintain context throughout the dialogue
   - average_turns: Total number of turns (user + assistant messages)

2. speech_and_interaction_quality:
   - wer_estimated: Subjective estimate of recognition quality (100=perfect)
   - response_latency_score: Response speed assessment. Default 100
   - mos: Mean Opinion Score - naturalness and quality (1-5)
   - self_recovery_rate: Whether the AI recovered from misunderstanding. Default 1 if no issues

3. business_impact:
   - escalation_rate: Whether escalation to human occurred (0 or 1)
   - automation_rate: Whether query was fully solved by AI (0 or 1)
   - cost_savings_estimated: 1.0 for successful automated call, 0.0 otherwise

4. user_satisfaction:
   - csat: Predicted Customer Satisfaction Score (1-100)
   - sentiment: "Positive", "Neutral", or "Negative"
   - frustration_detected: Whether irritation was detected
   - bail_out_rate: Whether user dropped the call or refused to engage

5. scenario_analysis:
   - top_fallback_intents: Topics where AI failed to understand
   - escalation_reason: Reason for escalation (if any)
   - success: Overall conversation success
   - summary: Brief summary of the conversation

IMPORTANT LANGUAGE RULES:
- "summary" and "escalation_reason" MUST be written in the same language as the conversation (e.g. Russian if the call is in Russian).
- "sentiment" MUST be one of these exact English values: "Positive", "Neutral", or "Negative" — do NOT translate it.
- All numeric metric values are language-neutral.

Return ONLY valid JSON without markdown formatting.
            `;

            const messages = [
                { role: 'system', content: 'You are a voice call analytics system. Respond only in JSON format.' },
                { role: 'user', content: prompt }
            ];

            const result = await this.openAiService.chatCompletion(messages);

            if (!result || !result.content) {
                this.logger.error('Failed to get analysis from OpenAI');
                return;
            }

            let metrics: AnalyticsMetrics;
            try {
                const sanitized = this.sanitizeJsonResponse(result.content);
                metrics = JSON.parse(sanitized);
            } catch (e) {
                this.logger.error('Failed to parse JSON from OpenAI', e);
                this.logger.debug('Raw OpenAI content:', result.content?.substring(0, 200));
                return;
            }

            // Валидация обязательных полей
            if (!metrics?.scenario_analysis || !metrics?.user_satisfaction) {
                this.logger.error(`Invalid metrics structure for ${channelId}: missing required sections`);
                return;
            }

            // Calculate cost via BillingService
            const totalTokens = result.usage ? result.usage.total_tokens : 0;
            let cost = 0;
            if (totalTokens > 0) {
                cost = await this.billingService.chargeAnalytics(channelId, totalTokens);
            }


            const analytics = await this.aiAnalyticsRepository.create({
                channelId,
                metrics,
                summary: metrics.scenario_analysis?.summary,
                sentiment: metrics.user_satisfaction?.sentiment,
                csat: metrics.user_satisfaction?.csat,
                cost: cost,
                tokens: totalTokens
            });

            this.logger.log(`Analysis saved for ${channelId}. Cost: ${cost}, Tokens: ${totalTokens}`);
            return analytics;

        } catch (e) {
            this.logger.error(`Error analyzing call ${channelId}: ` + e.message);
        }
    }

    async getAnalyticsByChannelId(channelId: string) {
        return await this.aiAnalyticsRepository.findOne({
            where: { channelId }
        });
    }

    async getAnalyticsDashboard(query: any, isAdmin: boolean, realUserId: string) {
        try {
            const { userId: queryUserId, assistantId, startDate, endDate, source } = query;

            // Определение userId с учетом прав доступа
            const userId = !queryUserId && isAdmin
                ? undefined
                : !isAdmin
                    ? realUserId
                    : queryUserId;

            // Построение WHERE-условия
            const whereClause: any = {};

            // Фильтр по периоду — используем Date объекты
            if (startDate && endDate) {
                whereClause.createdAt = {
                    [Op.between]: [
                        new Date(`${startDate}T00:00:00`),
                        new Date(`${endDate}T23:59:59`)
                    ]
                };
            } else if (startDate) {
                whereClause.createdAt = {
                    [Op.gte]: new Date(`${startDate}T00:00:00`)
                };
            } else if (endDate) {
                whereClause.createdAt = {
                    [Op.lte]: new Date(`${endDate}T23:59:59`)
                };
            }

            // Фильтр по userId
            if (userId) {
                whereClause.userId = String(userId);
            }

            // Фильтр по assistantId (поддержка массива)
            if (assistantId) {
                const assistantIds = Array.isArray(assistantId)
                    ? assistantId
                    : typeof assistantId === 'string'
                        ? assistantId.split(',').map(id => id.trim()).filter(Boolean)
                        : [];

                if (assistantIds.length > 0) {
                    whereClause.assistantId = {
                        [Op.in]: assistantIds
                    };
                }
            }

            // Фильтр по source (call, widget, playground)
            if (source) {
                whereClause.source = source;
            }

            // Получение всех CDR с аналитикой
            const cdrWithAnalytics = await this.aiCdrRepository.findAll({
                where: whereClause,
                include: [
                    {
                        model: AiAnalytics,
                        as: 'analytics',
                        required: false // LEFT JOIN для включения записей без аналитики
                    }
                ],
                order: [['createdAt', 'ASC']],
                limit: 50000 // Защита от чрезмерной нагрузки
            });

            // Общая статистика
            const totalCalls = cdrWithAnalytics.length;
            const totalCost = cdrWithAnalytics.reduce((sum, cdr) => sum + (cdr.cost || 0), 0);
            const totalTokens = cdrWithAnalytics.reduce((sum, cdr) => sum + (cdr.tokens || 0), 0);

            // Фильтруем только записи с аналитикой для вычисления метрик
            const analyticsData = cdrWithAnalytics.filter(cdr => cdr.analytics);
            const analyticsCount = analyticsData.length;

            // Агрегация метрик
            const aggregatedMetrics = this.aggregateMetrics(analyticsData, analyticsCount);

            // Временные ряды (группировка по периодам)
            const timeSeries = this.groupByTimePeriod(cdrWithAnalytics, startDate, endDate);

            // Метрики по ассистентам
            const assistantMetrics = this.groupByAssistant(cdrWithAnalytics);

            // Топ проблемных сценариев
            const topIssues = this.extractTopIssues(analyticsData);

            return {
                totalCalls,
                totalCost: parseFloat(totalCost.toFixed(2)),
                totalTokens,
                analyzedCalls: analyticsCount,
                metrics: aggregatedMetrics,
                timeSeries,
                assistantMetrics,
                topIssues
            };

        } catch (e) {
            this.logger.error('[AiAnalytics]: Dashboard error - ' + e.message);
            throw new HttpException({ message: "[AiAnalytics]: Dashboard request error", error: e.message }, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Очистка ответа OpenAI от известных артефактов, которые ломают JSON.parse:
     * 1. Markdown code fences (```json ... ```)
     * 2. BOM (Byte Order Mark) в начале строки
     * 3. Trailing commas перед } или ]
     * 4. Unicode zero-width символы (ZWSP, ZWNJ, ZWJ, BOM inline)
     * 5. Управляющие символы (кроме \n, \r, \t)
     */
    private sanitizeJsonResponse(raw: string): string {
        if (!raw) return '{}';

        let cleaned = raw;

        // 1. BOM (U+FEFF) — OpenAI иногда вставляет в начало
        cleaned = cleaned.replace(/^\uFEFF/, '');

        // 2. Markdown code fences: ```json\n{...}\n``` или ```\n{...}\n```
        cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');

        // 3. Zero-width символы внутри строки
        cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

        // 4. Управляющие символы (ASCII 0x00–0x1F) кроме \t \n \r — могут попадать при проблемах с кодировкой
        cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        // 5. Trailing commas: {a: 1,} или [1, 2,] — невалидный JSON, но GPT иногда генерирует
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

        // 6. Финальный trim
        cleaned = cleaned.trim();

        if (cleaned !== raw.trim()) {
            this.logger.debug('OpenAI response was sanitized before JSON.parse');
        }

        return cleaned;
    }

    /**
     * Безопасное извлечение метрик из вложенной структуры OpenAI JSON.
     * Поддерживает как вложенную структуру (accuracy_and_efficiency.intent_recognition_rate),
     * так и плоскую (intent_recognition_rate) для обратной совместимости.
     */
    private extractMetricValues(metrics: any): {
        intentRecognitionRate: number;
        entityExtractionRate: number;
        dialogCompletionRate: number;
        contextRetentionScore: number;
        averageTurns: number;
        werEstimated: number;
        responseLatencyScore: number;
        mos: number;
        selfRecoveryRate: number;
        escalationRate: number;
        automationRate: number;
        costSavingsEstimated: number;
        csat: number;
        frustrationDetected: boolean;
        bailOutRate: boolean;
        sentiment: string;
        topFallbackIntents: string[];
    } {
        if (!metrics) {
            return {
                intentRecognitionRate: 0, entityExtractionRate: 0,
                dialogCompletionRate: 0, contextRetentionScore: 0,
                averageTurns: 0, werEstimated: 0, responseLatencyScore: 0,
                mos: 0, selfRecoveryRate: 0, escalationRate: 0,
                automationRate: 0, costSavingsEstimated: 0, csat: 0,
                frustrationDetected: false, bailOutRate: false,
                sentiment: '', topFallbackIntents: []
            };
        }

        // Поддержка вложенной структуры (приоритет) и плоской (fallback)
        const ae = metrics.accuracy_and_efficiency || {};
        const sq = metrics.speech_and_interaction_quality || {};
        const bi = metrics.business_impact || {};
        const us = metrics.user_satisfaction || {};
        const sa = metrics.scenario_analysis || {};

        return {
            intentRecognitionRate: ae.intent_recognition_rate ?? metrics.intent_recognition_rate ?? 0,
            entityExtractionRate: ae.entity_extraction_rate ?? metrics.entity_extraction_rate ?? 0,
            dialogCompletionRate: ae.dialog_completion_rate ?? metrics.dialog_completion_rate ?? 0,
            contextRetentionScore: ae.context_retention_score ?? metrics.context_retention_score ?? 0,
            averageTurns: ae.average_turns ?? metrics.average_turns ?? 0,
            werEstimated: sq.wer_estimated ?? metrics.wer_estimated ?? 0,
            responseLatencyScore: sq.response_latency_score ?? metrics.response_latency_score ?? 0,
            mos: sq.mos ?? metrics.mos ?? 0,
            selfRecoveryRate: sq.self_recovery_rate ?? metrics.self_recovery_rate ?? 0,
            escalationRate: bi.escalation_rate ?? metrics.escalation_rate ?? 0,
            automationRate: bi.automation_rate ?? metrics.automation_rate ?? 0,
            costSavingsEstimated: bi.cost_savings_estimated ?? metrics.cost_savings_estimated ?? 0,
            csat: us.csat ?? metrics.csat ?? 0,
            frustrationDetected: us.frustration_detected ?? metrics.frustration_detected ?? false,
            bailOutRate: us.bail_out_rate ?? metrics.bail_out_rate ?? false,
            sentiment: us.sentiment ?? metrics.sentiment ?? '',
            topFallbackIntents: sa.top_fallback_intents ?? metrics.top_fallback_intents ?? []
        };
    }

    /**
     * Агрегация метрик по всем записям с аналитикой
     */
    private aggregateMetrics(analyticsData: AiCdr[], analyticsCount: number) {
        const defaultMetrics = {
            avgIntentRecognitionRate: 0,
            avgEntityExtractionRate: 0,
            dialogCompletionRate: 0,
            avgContextRetentionScore: 0,
            avgTurns: 0,
            avgWerEstimated: 0,
            avgResponseLatencyScore: 0,
            avgMos: 0,
            selfRecoveryRate: 0,
            escalationRate: 0,
            automationRate: 0,
            avgCostSavingsEstimated: 0,
            avgCsat: 0,
            sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
            frustrationDetectedRate: 0,
            bailOutRate: 0
        };

        if (analyticsCount === 0) return defaultMetrics;

        const sums = {
            intentRecognitionRate: 0,
            entityExtractionRate: 0,
            dialogCompletionRate: 0,
            contextRetentionScore: 0,
            averageTurns: 0,
            werEstimated: 0,
            responseLatencyScore: 0,
            mos: 0,
            selfRecoveryRate: 0,
            escalationRate: 0,
            automationRate: 0,
            costSavingsEstimated: 0,
            csat: 0,
            frustrationDetected: 0,
            bailOutRate: 0,
            positiveCount: 0,
            neutralCount: 0,
            negativeCount: 0
        };

        analyticsData.forEach(cdr => {
            const extracted = this.extractMetricValues(cdr.analytics?.metrics);

            sums.intentRecognitionRate += extracted.intentRecognitionRate;
            sums.entityExtractionRate += extracted.entityExtractionRate;
            sums.dialogCompletionRate += extracted.dialogCompletionRate;
            sums.contextRetentionScore += extracted.contextRetentionScore;
            sums.averageTurns += extracted.averageTurns;
            sums.werEstimated += extracted.werEstimated;
            sums.responseLatencyScore += extracted.responseLatencyScore;
            sums.mos += extracted.mos;
            sums.selfRecoveryRate += extracted.selfRecoveryRate;
            sums.escalationRate += extracted.escalationRate;
            sums.automationRate += extracted.automationRate;
            sums.costSavingsEstimated += extracted.costSavingsEstimated;

            // CSAT: берём из колонки модели (приоритет) или из вложенных метрик
            sums.csat += cdr.analytics?.csat || extracted.csat || 0;

            sums.frustrationDetected += extracted.frustrationDetected ? 1 : 0;
            sums.bailOutRate += extracted.bailOutRate ? 1 : 0;

            // Sentiment: приоритет — колонка модели, затем из метрик
            const sentiment = (cdr.analytics?.sentiment || extracted.sentiment || '').toLowerCase();
            if (sentiment === 'positive') sums.positiveCount++;
            else if (sentiment === 'neutral') sums.neutralCount++;
            else if (sentiment === 'negative') sums.negativeCount++;
        });

        const avg = (val: number) => parseFloat((val / analyticsCount).toFixed(2));
        const pct = (val: number) => parseFloat(((val / analyticsCount) * 100).toFixed(2));

        return {
            avgIntentRecognitionRate: avg(sums.intentRecognitionRate),
            avgEntityExtractionRate: avg(sums.entityExtractionRate),
            dialogCompletionRate: avg(sums.dialogCompletionRate),
            avgContextRetentionScore: avg(sums.contextRetentionScore),
            avgTurns: avg(sums.averageTurns),
            avgWerEstimated: avg(sums.werEstimated),
            avgResponseLatencyScore: avg(sums.responseLatencyScore),
            avgMos: avg(sums.mos),
            selfRecoveryRate: avg(sums.selfRecoveryRate),
            escalationRate: avg(sums.escalationRate),
            automationRate: avg(sums.automationRate),
            avgCostSavingsEstimated: avg(sums.costSavingsEstimated),
            avgCsat: avg(sums.csat),
            sentimentDistribution: {
                positive: pct(sums.positiveCount),
                neutral: pct(sums.neutralCount),
                negative: pct(sums.negativeCount)
            },
            frustrationDetectedRate: pct(sums.frustrationDetected),
            bailOutRate: pct(sums.bailOutRate)
        };
    }

    private groupByTimePeriod(data: AiCdr[], startDate?: string, endDate?: string): any[] {
        if (!data || data.length === 0) return [];

        // Определение периода группировки
        const start = startDate ? new Date(startDate) : new Date(data[0].createdAt);
        const end = endDate ? new Date(endDate) : new Date(data[data.length - 1].createdAt);
        const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        let groupFormat: string;
        if (daysDiff <= 31) {
            groupFormat = 'day';
        } else if (daysDiff <= 366) {
            groupFormat = 'month';
        } else {
            groupFormat = 'year';
        }

        const groups: Record<string, {
            label: string;
            callsCount: number;
            totalCsat: number;
            csatCount: number;
            totalMos: number;
            mosCount: number;
            automationCount: number;
            automationTotal: number;
            totalCost: number;
            totalTokens: number;
        }> = {};

        data.forEach(cdr => {
            const date = new Date(cdr.createdAt);
            let label: string;

            if (groupFormat === 'day') {
                label = date.toISOString().split('T')[0];
            } else if (groupFormat === 'month') {
                label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            } else {
                label = `${date.getFullYear()}`;
            }

            if (!groups[label]) {
                groups[label] = {
                    label,
                    callsCount: 0,
                    totalCsat: 0,
                    csatCount: 0,
                    totalMos: 0,
                    mosCount: 0,
                    automationCount: 0,
                    automationTotal: 0,
                    totalCost: 0,
                    totalTokens: 0
                };
            }

            groups[label].callsCount++;
            groups[label].totalCost += cdr.cost || 0;
            groups[label].totalTokens += cdr.tokens || 0;

            if (cdr.analytics) {
                const extracted = this.extractMetricValues(cdr.analytics.metrics);

                if (cdr.analytics.csat || extracted.csat) {
                    groups[label].totalCsat += cdr.analytics.csat || extracted.csat;
                    groups[label].csatCount++;
                }
                if (extracted.mos) {
                    groups[label].totalMos += extracted.mos;
                    groups[label].mosCount++;
                }
                groups[label].automationCount += extracted.automationRate;
                groups[label].automationTotal++;
            }
        });

        return Object.values(groups).map(group => ({
            label: group.label,
            callsCount: group.callsCount,
            avgCsat: group.csatCount > 0 ? parseFloat((group.totalCsat / group.csatCount).toFixed(2)) : 0,
            avgMos: group.mosCount > 0 ? parseFloat((group.totalMos / group.mosCount).toFixed(2)) : 0,
            automationRate: group.automationTotal > 0 ? parseFloat(((group.automationCount / group.automationTotal) * 100).toFixed(2)) : 0,
            totalCost: parseFloat(group.totalCost.toFixed(2)),
            totalTokens: group.totalTokens
        }));
    }

    private groupByAssistant(data: AiCdr[]): any[] {
        if (!data || data.length === 0) return [];

        const groups: Record<string, {
            assistantId: string;
            assistantName: string;
            callsCount: number;
            totalCsat: number;
            csatCount: number;
            automationCount: number;
            automationTotal: number;
            totalCost: number;
        }> = {};

        data.forEach(cdr => {
            const aId = cdr.assistantId || 'unknown';
            const aName = cdr.assistantName || 'Unknown';

            if (!groups[aId]) {
                groups[aId] = {
                    assistantId: aId,
                    assistantName: aName,
                    callsCount: 0,
                    totalCsat: 0,
                    csatCount: 0,
                    automationCount: 0,
                    automationTotal: 0,
                    totalCost: 0
                };
            }

            groups[aId].callsCount++;
            groups[aId].totalCost += cdr.cost || 0;

            if (cdr.analytics) {
                const extracted = this.extractMetricValues(cdr.analytics.metrics);

                if (cdr.analytics.csat || extracted.csat) {
                    groups[aId].totalCsat += cdr.analytics.csat || extracted.csat;
                    groups[aId].csatCount++;
                }
                groups[aId].automationCount += extracted.automationRate;
                groups[aId].automationTotal++;
            }
        });

        return Object.values(groups).map(group => ({
            assistantId: group.assistantId,
            assistantName: group.assistantName,
            callsCount: group.callsCount,
            avgCsat: group.csatCount > 0 ? parseFloat((group.totalCsat / group.csatCount).toFixed(2)) : 0,
            automationRate: group.automationTotal > 0 ? parseFloat(((group.automationCount / group.automationTotal) * 100).toFixed(2)) : 0,
            totalCost: parseFloat(group.totalCost.toFixed(2))
        }));
    }

    private extractTopIssues(data: AiCdr[]): { intent: string; count: number }[] {
        if (!data || data.length === 0) return [];

        const issuesMap: Record<string, number> = {};

        data.forEach(cdr => {
            const extracted = this.extractMetricValues(cdr.analytics?.metrics);
            const intents = extracted.topFallbackIntents;

            if (Array.isArray(intents)) {
                intents.forEach((intent: string) => {
                    if (intent) {
                        issuesMap[intent] = (issuesMap[intent] || 0) + 1;
                    }
                });
            }
        });

        return Object.entries(issuesMap)
            .map(([intent, count]) => ({ intent, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

}
