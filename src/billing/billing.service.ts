import { Injectable, Logger } from '@nestjs/common';

import { InjectModel } from '@nestjs/sequelize';

import { AiCdr } from '../ai-cdr/ai-cdr.model';

import { Prices } from '../prices/prices.model';

import { BillingRecord } from './billing-record.model';

import { UsersService } from '../users/users.service';

import { OpenAiUsage, BillingResult } from './interfaces/openai-usage.interface';

import { Op } from 'sequelize';

import { GetBillingDto } from './dto/get-billing.dto';

import { LoggerService } from '../logger/logger.service';

import { BillingFxService, distributeProportional, FxSnapshot } from './billing-fx.service';

import { getTenantCurrency, isRubTenant } from '../shared/tenant/tenant-currency';



@Injectable()

export class BillingService {

    private readonly logger = new Logger(BillingService.name);



    constructor(

        @InjectModel(AiCdr) private readonly aiCdrRepository: typeof AiCdr,

        @InjectModel(Prices) private readonly pricesRepository: typeof Prices,

        @InjectModel(BillingRecord) private readonly billingRecordRepository: typeof BillingRecord,

        private readonly usersService: UsersService,

        private readonly logService: LoggerService,

        private readonly billingFx: BillingFxService,

    ) { }



    private recordDefaults(

        channelId: string,

        type: string,

        userId: string,

        description: string,

    ): {
        channelId: string;
        type: string;
        userId: string;
        description: string;
        currency: string;
    } {
        return {
            channelId,
            type,
            userId,
            description,
            currency: getTenantCurrency(),
        };
    }



    private async applyFxDistribution(

        parts: { key: string; record: BillingRecord; usd: number }[],

        totalUsd: number,

    ): Promise<FxSnapshot> {

        if (totalUsd <= 0 || !parts.length) {
            return this.billingFx.captureSnapshot(totalUsd);
        }

        const snap = await this.billingFx.captureSnapshot(totalUsd);

        const fx = this.billingFx.toFxFields(snap);

        const distributed = distributeProportional(

            parts.map((p) => ({ key: p.key, usd: p.usd })),

            snap.amountCurrency ?? 0,

        );



        for (const p of parts) {

            await p.record.update({

                currency: fx.currency,

                amountCurrency: distributed[p.key] ?? 0,

                fxRateUsdToCurrency: fx.fxRateUsdToCurrency,

                fxRateSource: fx.fxRateSource,

                fxCapturedAt: fx.fxCapturedAt,

            });

        }

        return snap;

    }



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

                    defaults: this.recordDefaults(

                        channelId,

                        'realtime',

                        String(aiCdr.userId),

                        'Realtime call',

                    ),

                });

                await record.increment({ audioTokens, textTokens, totalTokens });



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

     * Accumulate text tokens from a non-realtime LLM response.

     * Uses findOrCreate + increment to maintain one record per channelId.

     */

    async accumulateNonRealtimeTokens(channelId: string, userId: string, textTokens: number): Promise<void> {

        try {

            if (textTokens <= 0) return;



            const [record] = await this.billingRecordRepository.findOrCreate({

                where: { channelId, type: 'non-realtime' },

                defaults: this.recordDefaults(channelId, 'non-realtime', userId, 'Non-realtime call'),

            });

            await record.increment({ textTokens, totalTokens: textTokens });



            const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });

            if (aiCdr) {

                await aiCdr.increment({ tokens: textTokens });

            }



            this.logger.log(

                `Non-realtime tokens accumulated for ${channelId}: text=${textTokens}`,

            );

        } catch (e) {

            this.logger.error(`Error accumulating non-realtime tokens for ${channelId}: ${e.message}`);

        }

    }



    /**

     * Finalize billing when a call ends (hangup).

     * Calculates costs for the single realtime + non-realtime + analytic BillingRecords.

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

            amountCurrency: null,

            costCurrency: getTenantCurrency(),

        };



        try {

            const aiCdr = await this.aiCdrRepository.findOne({ where: { channelId } });

            if (!aiCdr) {

                this.logger.warn(`CDR not found for finalizeCallBilling: ${channelId}`);

                return result;

            }



            const userId = aiCdr.userId;

            const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });



            if (!price) {

                this.logger.warn(`Price not found for userId: ${userId}, skipping cost calculation`);

                return result;

            }



            const fxParts: { key: string; record: BillingRecord; usd: number }[] = [];



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



                if (totalCost > 0) {

                    fxParts.push({ key: 'realtime', record: realtimeRecord, usd: totalCost });

                }

            }



            const nonRealtimeRecord = await this.billingRecordRepository.findOne({

                where: { channelId, type: 'non-realtime' },

            });



            if (nonRealtimeRecord) {

                const textCost = nonRealtimeRecord.textTokens * (price.text / 1_000_000);

                const totalCost = textCost;



                await nonRealtimeRecord.update({ textCost, totalCost });



                result.textTokens += nonRealtimeRecord.textTokens;

                result.textCost += textCost;



                if (totalCost > 0) {

                    fxParts.push({ key: 'non-realtime', record: nonRealtimeRecord, usd: totalCost });

                }

            }



            const analyticRecord = await this.billingRecordRepository.findOne({

                where: { channelId, type: 'analytic' },

            });



            if (analyticRecord) {

                result.analyticTokens = analyticRecord.totalTokens;

                result.analyticCost = Number(analyticRecord.totalCost) || 0;

                if (result.analyticCost > 0) {

                    fxParts.push({ key: 'analytic', record: analyticRecord, usd: result.analyticCost });

                }

            }



            result.totalCost = result.audioCost + result.textCost + result.analyticCost;



            const snap = result.totalCost > 0 && fxParts.length > 0
                ? await this.applyFxDistribution(fxParts, result.totalCost)
                : await this.billingFx.captureSnapshot(result.totalCost);

            result.amountCurrency = snap.amountCurrency;
            result.costCurrency = snap.currency;

            await aiCdr.update({
                cost: result.totalCost,
                costCurrency: snap.currency,
                amountCurrency: snap.amountCurrency,
            });



            const realtimeCost = result.audioCost + result.textCost;

            if (realtimeCost > 0) {

                await this.usersService.decrementUserBalance(userId, realtimeCost, {

                    source: 'usage_realtime',

                    externalId: `usage_rt_${channelId}`,

                });

            }



            await this.logService.logAction(

                Number(userId), 'update', 'billing', null,

                `Call billing finalized: $${result.totalCost.toFixed(6)} (channel: ${channelId})`,

                null, { channelId, audioCost: result.audioCost, textCost: result.textCost, analyticCost: result.analyticCost, totalCost: result.totalCost },

            );



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

            const price = await this.pricesRepository.findOne({ where: { userId: Number(userId) } });



            if (!price) {

                this.logger.warn(`Price not found for userId: ${userId}, skipping analytics billing`);

                return 0;

            }



            const analyticCost = totalTokens * (price.analytic / 1_000_000);

            const snap = await this.billingFx.captureSnapshot(analyticCost);

            const fx = this.billingFx.toFxFields(snap);



            const [record] = await this.billingRecordRepository.findOrCreate({

                where: { channelId, type: 'analytic' },

                defaults: this.recordDefaults(

                    channelId,

                    'analytic',

                    String(userId),

                    'Call analytics',

                ),

            });



            await record.increment({

                textTokens: totalTokens,

                totalTokens,

                totalCost: analyticCost,

                textCost: analyticCost,

            });



            const prevAmountCurrency = Number(record.amountCurrency) || 0;

            const addAmountCurrency = snap.amountCurrency ?? 0;

            await record.update({

                currency: fx.currency,

                amountCurrency: prevAmountCurrency + addAmountCurrency,

                fxRateUsdToCurrency: fx.fxRateUsdToCurrency,

                fxRateSource: fx.fxRateSource,

                fxCapturedAt: fx.fxCapturedAt,

            });



            await aiCdr.increment({ tokens: totalTokens, cost: analyticCost });



            if (analyticCost > 0) {

                await this.usersService.decrementUserBalance(userId, analyticCost, {

                    source: 'usage_analytics',

                    externalId: `usage_an_${channelId}_${record.id}`,

                });

            }



            await this.logService.logAction(

                Number(userId), 'update', 'billing', null,

                `Analytics charged: $${analyticCost.toFixed(6)} (channel: ${channelId})`,

                null, { channelId, totalTokens, analyticCost },

            );



            this.logger.log(

                `Analytics charged for ${channelId}: tokens=${totalTokens}, cost=${analyticCost.toFixed(6)}`,

            );



            return analyticCost;

        } catch (e) {

            this.logger.error(`Error charging analytics for ${channelId}: ${e.message}`);

            return 0;

        }

    }



    async backfillFxSnapshots(limit = 5000, userId?: string): Promise<{ updated: number; userId: string | null }> {
        const userIdTrimmed = userId?.trim() || null;
        const updated = await this.billingFx.backfillAllMissing(limit, userIdTrimmed ?? undefined);
        if (userIdTrimmed) {
            this.logger.log(`backfillFxSnapshots: updated=${updated} userId=${userIdTrimmed}`);
        }
        return { updated, userId: userIdTrimmed };
    }



    /**

     * Get paginated billing history for a user.

     * Admins can see all records or filter by userId.

     * Non-admins see only their own records.

     */

    async getBillingHistory(query: GetBillingDto, isAdmin: boolean, realUserId: string) {

        const page = Number(query.page) || 1;

        const limit = Number(query.limit) || 20;

        const offset = (page - 1) * limit;



        const where: any = {};



        if (!isAdmin) {

            where.userId = String(realUserId);

        } else if (query.userId) {

            where.userId = String(query.userId);

        }



        if (query.startDate && query.endDate) {

            where.createdAt = {

                [Op.between]: [

                    new Date(`${query.startDate}T00:00:00`),

                    new Date(`${query.endDate}T23:59:59`),

                ],

            };

        } else if (query.startDate) {

            where.createdAt = { [Op.gte]: new Date(`${query.startDate}T00:00:00`) };

        } else if (query.endDate) {

            where.createdAt = { [Op.lte]: new Date(`${query.endDate}T23:59:59`) };

        }



        if (query.type) {

            where.type = query.type;

        }



        const sortField = query.sortField || 'createdAt';

        const sortOrder = query.sortOrder || 'DESC';



        const { rows, count } = await this.billingRecordRepository.findAndCountAll({

            where,

            order: [[sortField, sortOrder]],

            limit,

            offset,

            include: [

                {

                    model: AiCdr,

                    as: 'aiCdr',

                    attributes: ['channelId', 'assistantName', 'callerId', 'source', 'duration'],

                    required: false,

                },

            ],

        });



        const totalCostRaw = await this.billingRecordRepository.sum('totalCost', { where } as any);

        const totalCost = parseFloat((totalCostRaw || 0).toFixed(6));



        let totalAmountCurrency: number | null = null;

        if (isRubTenant()) {

            const sumClient = await this.billingRecordRepository.sum('amountCurrency', { where } as any);

            totalAmountCurrency = parseFloat((Number(sumClient) || 0).toFixed(2));

        }



        return { rows, count, totalCost, totalAmountCurrency, page, limit };

    }

}

