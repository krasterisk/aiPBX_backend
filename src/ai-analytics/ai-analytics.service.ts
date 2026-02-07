import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from "@nestjs/sequelize";
import { AiAnalytics } from "./ai-analytics.model";
import { AiCdrService } from "../ai-cdr/ai-cdr.service";
import { OpenAiService } from "../open-ai/open-ai.service";

import { AiCdr } from "../ai-cdr/ai-cdr.model";
import { Prices } from "../prices/prices.model";
import { UsersService } from "../users/users.service";

@Injectable()
export class AiAnalyticsService {
    private readonly logger = new Logger(AiAnalyticsService.name);

    constructor(
        @InjectModel(AiAnalytics) private aiAnalyticsRepository: typeof AiAnalytics,
        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        @Inject(UsersService) private readonly usersService: UsersService,
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

Analyze the dialogue according to the following criteria and return a JSON object:

1. **Accuracy and Efficiency (NLU)**
    - intent_recognition_rate (0-100): How accurately the AI identified the user's intent.
    - entity_extraction_rate (0-100): Accuracy of extracting key data (names, dates, amounts, etc.).
    - dialog_completion_rate (0 or 1): Whether the dialogue was logically completed and the goal achieved without escalation to a human.
    - context_retention_score (0-100): Ability to maintain context throughout the dialogue.
    - average_turns (int): Total number of turns (user + assistant messages).

2. **Speech and Interaction Quality**
    - wer_estimated (0-100): *Subjective estimate* of speech recognition quality (100 is perfect, 0 is unreadable).
    - response_latency_score (0-100): Assessment of response speed (based on user feedback or waiting indicators). Default to 100.
    - mos (1-5): Mean Opinion Score - naturalness, human-likeness, and quality of interaction.
    - self_recovery_rate (0 or 1): Whether the AI successfully recovered from a misunderstanding. Default to 1 if no misunderstandings occurred.

3. **Business Impact**
    - escalation_rate (0 or 1): Whether there was an escalation to a human agent.
    - automation_rate (0 or 1): Whether the query was fully solved by the AI.
    - cost_savings_estimated (float): Estimated savings (1.0 for a successful automated call, 0.0 otherwise).

4. **User Satisfaction (Sentiment)**
    - csat (1-5): Predicted Customer Satisfaction Score.
    - sentiment (string): "Positive", "Neutral", "Negative".
    - frustration_detected (boolean): Whether any irritation or frustration was detected in the user's responses.
    - bail_out_rate (boolean): Whether the user dropped the call immediately or refused to engage.

5. **Scenario Analysis**
    - top_fallback_intents (list of strings): Topics where the AI failed to understand or provide a correct answer.
    - escalation_reason (string): Reason for the escalation (if any).
    - success (boolean): Overall conversation success.
    - summary (string): A brief summary of the conversation.

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

            let metrics;
            try {
                metrics = JSON.parse(result.content);
            } catch (e) {
                this.logger.error('Failed to parse JSON from OpenAI', e);
                return;
            }

            // Calculate cost
            let cost = 0;
            const totalTokens = result.usage ? result.usage.total_tokens : 0;

            try {
                const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });
                if (aiCdr && totalTokens > 0) {
                    const userId = aiCdr.userId;
                    const price = await this.pricesRepository.findOne({ where: { userId } });

                    if (price) {
                        cost = totalTokens * (price.analytic / 1000000);
                        if (cost > 0) {
                            await this.usersService.decrementUserBalance(userId, cost);
                        }
                    }
                }
            } catch (e) {
                this.logger.error(`Error calculating cost for ${channelId}: ` + e.message);
            }


            await this.aiAnalyticsRepository.create({
                channelId,
                metrics,
                summary: metrics.summary,
                sentiment: metrics.sentiment,
                csat: metrics.csat,
                cost: cost,
                tokens: totalTokens
            });

            this.logger.log(`Analysis saved for ${channelId}. Cost: ${cost}, Tokens: ${totalTokens}`);

        } catch (e) {
            this.logger.error(`Error analyzing call ${channelId}: ` + e.message);
        }
    }

    async getAnalyticsByChannelId(channelId: string) {
        return await this.aiAnalyticsRepository.findOne({
            where: { channelId }
        });
    }
}
