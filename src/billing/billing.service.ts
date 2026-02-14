import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { Prices } from '../prices/prices.model';
import { BillingRecord } from './billing-record.model';
import { UsersService } from '../users/users.service';
import { OpenAiUsage, BillingResult } from './interfaces/openai-usage.interface';

@Injectable()
export class BillingService {
    private readonly logger = new Logger(BillingService.name);

    constructor(
        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,
        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,
        @InjectModel(BillingRecord) private readonly billingRecordRepository: typeof BillingRecord,
        private readonly usersService: UsersService,
    ) { }

    /**
     * Accumulate realtime tokens from a response.done event.
     * Uses findOrCreate + increment to maintain one record per channelId.
     */
    async accumulateRealtimeTokens(channelId: string, usage: OpenAiUsage): Promise<void> {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });
            if (!aiCdr) {
                this.logger.warn(`CDR not found for channelId: ${channelId}, skipping token accumulation`);
                return;
            }

            const inputAudio = usage.input_token_details?.audio_tokens ?? 0;
            const outputAudio = usage.output_token_details?.audio_tokens ?? 0;
            const inputText = usage.input_token_details?.text_tokens ?? 0;
            const outputText = usage.output_token_details?.text_tokens ?? 0;

            const audioTokens = inputAudio + outputAudio;
            const textTokens = inputText + outputText;
            const totalTokens = audioTokens + textTokens;

            if (totalTokens > 0) {
                const [record] = await this.billingRecordRepository.findOrCreate({
                    where: { channelId, type: 'realtime' },
                    defaults: { channelId, type: 'realtime' },
                });
                await record.increment({ audioTokens, textTokens, totalTokens });

                // Update cached totals in CDR
                await aiCdr.increment({ tokens: totalTokens });

                this.logger.log(
                    `Realtime tokens accumulated for ${channelId}: audio=${audioTokens}, text=${textTokens}`,
                );
            }
        } catch (e) {
            this.logger.error(`Error accumulating tokens for ${channelId}: ${e.message}`);
        }
    }

    /**
     * Finalize billing when a call ends (hangup).
     * Calculates costs for the single realtime + analytic BillingRecords.
     */
    async finalizeCallBilling(channelId: string): Promise<BillingResult> {
        const result: BillingResult = {
            audioTokens: 0,
            textTokens: 0,
            analyticTokens: 0,
            audioCost: 0,
            textCost: 0,
            analyticCost: 0,
            totalCost: 0,
        };

        try {
            const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });
            if (!aiCdr) {
                this.logger.warn(`CDR not found for finalizeCallBilling: ${channelId}`);
                return result;
            }

            const userId = aiCdr.userId;
            const price = await this.pricesRepository.findOne({ where: { userId } });

            if (!price) {
                this.logger.warn(`Price not found for userId: ${userId}, skipping cost calculation`);
                return result;
            }

            // Get the single realtime record for this call
            const realtimeRecord = await this.billingRecordRepository.findOne({
                where: { channelId, type: 'realtime' },
            });

            if (realtimeRecord) {
                const audioCost = realtimeRecord.audioTokens * (price.realtime / 1_000_000);
                const textCost = realtimeRecord.textTokens * (price.text / 1_000_000);
                const totalCost = audioCost + textCost;

                await realtimeRecord.update({ audioCost, textCost, totalCost });

                result.audioTokens = realtimeRecord.audioTokens;
                result.textTokens = realtimeRecord.textTokens;
                result.audioCost = audioCost;
                result.textCost = textCost;
            }

            // Get the single analytic record for this call
            const analyticRecord = await this.billingRecordRepository.findOne({
                where: { channelId, type: 'analytic' },
            });

            if (analyticRecord) {
                result.analyticTokens = analyticRecord.totalTokens;
                result.analyticCost = analyticRecord.totalCost;
            }

            result.totalCost = result.audioCost + result.textCost + result.analyticCost;

            // Update cached totals in CDR
            await aiCdr.update({ cost: result.totalCost });

            // Deduct realtime cost from balance (analytic was already deducted)
            const realtimeCost = result.audioCost + result.textCost;
            if (realtimeCost > 0) {
                await this.usersService.decrementUserBalance(userId, realtimeCost);
            }

            this.logger.log(
                `Billing finalized for ${channelId}: audioCost=${result.audioCost.toFixed(6)}, ` +
                `textCost=${result.textCost.toFixed(6)}, analyticCost=${result.analyticCost.toFixed(6)}, ` +
                `totalCost=${result.totalCost.toFixed(6)}`,
            );

            return result;
        } catch (e) {
            this.logger.error(`Error finalizing billing for ${channelId}: ${e.message}`);
            return result;
        }
    }

    /**
     * Charge for analytics (chatCompletion call).
     * Uses findOrCreate + increment for one analytic record per call.
     */
    async chargeAnalytics(channelId: string, totalTokens: number): Promise<number> {
        try {
            const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });
            if (!aiCdr) {
                this.logger.warn(`CDR not found for chargeAnalytics: ${channelId}`);
                return 0;
            }

            const userId = aiCdr.userId;
            const price = await this.pricesRepository.findOne({ where: { userId } });

            if (!price) {
                this.logger.warn(`Price not found for userId: ${userId}, skipping analytics billing`);
                return 0;
            }

            const analyticCost = totalTokens * (price.analytic / 1_000_000);

            const [record] = await this.billingRecordRepository.findOrCreate({
                where: { channelId, type: 'analytic' },
                defaults: { channelId, type: 'analytic' },
            });
            // Chat completion tokens are all text tokens
            await record.increment({ textTokens: totalTokens, totalTokens, totalCost: analyticCost, textCost: analyticCost });

            // Update cached totals in CDR
            await aiCdr.increment({ tokens: totalTokens, cost: analyticCost });

            if (analyticCost > 0) {
                await this.usersService.decrementUserBalance(userId, analyticCost);
            }

            this.logger.log(
                `Analytics charged for ${channelId}: tokens=${totalTokens}, cost=${analyticCost.toFixed(6)}`,
            );

            return analyticCost;
        } catch (e) {
            this.logger.error(`Error charging analytics for ${channelId}: ${e.message}`);
            return 0;
        }
    }
}
