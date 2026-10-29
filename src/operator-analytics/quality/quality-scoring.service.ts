import { Injectable, NotFoundException, BadRequestException, ConflictException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { randomUUID } from 'crypto';
import { Op, Transaction } from 'sequelize';
import { AiAnalytics } from '../../ai-analytics/ai-analytics.model';
import { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { MetricValue } from '../operator-metric-value.model';
import { MetricOverride } from '../operator-metric-override.model';
import { OperatorAnalytics } from '../operator-analytics.model';
import { QualityAnalysisRun, QualityScorecardRevision } from './quality-score.models';
import {
    calculateQualityScore,
    createQualityScorecard,
    qualityHash,
    QualityScorecard,
    QualityScoreResult,
} from './quality-score';
import { isOperatorAnalyticsSource } from '../lib/analytics-source';

@Injectable()
export class QualityScoringService {
    constructor(
        @InjectModel(QualityAnalysisRun) private readonly runs: typeof QualityAnalysisRun,
        @InjectModel(QualityScorecardRevision) private readonly cards: typeof QualityScorecardRevision,
        @InjectModel(AiAnalytics) private readonly analytics: typeof AiAnalytics,
        @InjectModel(AiCdr) private readonly cdrs: typeof AiCdr,
        @InjectModel(MetricValue) private readonly values: typeof MetricValue,
        @InjectModel(MetricOverride) private readonly overrides: typeof MetricOverride,
        @Optional() @InjectModel(OperatorAnalytics) private readonly operatorRecords?: typeof OperatorAnalytics
    ) {}

    get enabled(): boolean {
        return process.env.QUALITY_SCORE_V2_ENABLED === 'true';
    }

    private async saveRun(
        input: {
            userId: string;
            projectId: number | null;
            channelId: string;
            key: string;
            kind: QualityAnalysisRun['kind'];
            previousRunId: string | null;
            card: QualityScorecard;
            raw: Record<string, any>;
            result: QualityScoreResult;
        },
        transaction: Transaction
    ) {
        if (input.card.userId !== input.userId || input.card.projectId !== input.projectId)
            throw new Error('Quality snapshot scope mismatch');
        const revisionId = qualityHash(input.card);
        await this.cards.findOrCreate({
            where: { id: revisionId },
            defaults: { id: revisionId, userId: input.userId, projectId: input.projectId, snapshot: input.card },
            transaction,
        });
        return this.runs.create(
            {
                id: randomUUID(),
                operationKey: input.key,
                scorecardRevisionId: revisionId,
                userId: input.userId,
                projectId: input.projectId,
                channelId: input.channelId,
                previousRunId: input.previousRunId,
                kind: input.kind,
                rawSnapshot: input.raw,
                result: input.result,
            },
            { transaction }
        );
    }

    /** Caller supplies the rule snapshot captured before the LLM request, never current settings. */
    async writeAnalysis(input: {
        userId: string;
        projectId?: number | null;
        channelId: string;
        operationId: string;
        card: QualityScorecard;
        fields: Record<string, any>;
        inputSnapshot?: Record<string, any> | null;
        initialOverrides?: any[];
    }, outerTransaction?:Transaction) {
        const userId = String(input.userId),
            projectId = input.projectId ?? null;
        const operationKey = qualityHash({
            userId,
            channelId: input.channelId,
            operation: input.operationId,
            kind: 'analysis',
        });
        const write=async (transaction:Transaction) => {
            const cdr = await this.cdrs.findOne({
                where: { channelId: input.channelId, userId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!cdr || (cdr.projectId ?? null) !== projectId) throw new Error('Quality record not found in scope');
            const existingRun = await this.runs.findOne({
                where: { operationKey, userId, channelId: input.channelId },
                transaction,
            });
            if (existingRun) return existingRun;
            let existing = await this.analytics.findOne({
                where: { channelId: input.channelId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            let previousRunId = existing?.qualityRunId ?? null;
            if (existing && !previousRunId) {
                const legacyMetrics = existing.metrics as Record<string, any>;
                const oldOverrides = (
                    await this.overrides.findAll({ where: { channelId: input.channelId, userId }, transaction })
                ).map((row) => row.toJSON());
                const legacyCard = createQualityScorecard({ id: projectId }, userId, {
                    legacy: true,
                    metrics: legacyMetrics,
                });
                const baseline = await this.saveRun(
                    {
                        userId,
                        projectId,
                        channelId: input.channelId,
                        key: qualityHash({ baseline: input.channelId, userId, raw: legacyMetrics }),
                        kind: 'legacy_baseline',
                        previousRunId: null,
                        card: legacyCard,
                        raw: {
                            metrics: legacyMetrics,
                            overrides: oldOverrides,
                            summary: existing.summary,
                            csat: existing.csat,
                            sentiment: existing.sentiment,
                            provenance: 'legacy values preserved; derived score is not an originally stored score',
                        },
                        result: calculateQualityScore(legacyCard, legacyMetrics, oldOverrides),
                    },
                    transaction
                );
                previousRunId = baseline.id;
            }
            if (!existing)
                existing = await this.analytics.create({ ...input.fields, channelId: input.channelId } as any, {
                    transaction,
                });
            const result = calculateQualityScore(input.card, input.fields.metrics, input.initialOverrides ?? []);
            const run = await this.saveRun(
                {
                    userId,
                    projectId,
                    channelId: input.channelId,
                    key: operationKey,
                    kind: input.card.provenance === 'legacy_derived' ? 'legacy_derived' : 'analysis',
                    previousRunId,
                    card: input.card,
                    raw: {
                        metrics: input.fields.metrics,
                        summary: input.fields.summary,
                        csat: input.fields.csat,
                        sentiment: input.fields.sentiment,
                        input: input.inputSnapshot ?? null,
                        overrides: input.initialOverrides ?? [],
                    },
                    result,
                },
                transaction
            );
            const fields = { ...input.fields, channelId: input.channelId, ...this.projection(run) };
            await existing.update(fields, { transaction });
            // Corrections belong to the previous evaluation, never silently to a new AI answer.
            await this.overrides.destroy({ where: { channelId: input.channelId, userId }, transaction });
            if (input.initialOverrides?.length) await this.overrides.bulkCreate(input.initialOverrides.map(item => ({
                channelId: input.channelId, userId, actorUserId: item.actorUserId || userId,
                metricId: item.metricId, origin: item.origin, status: item.status ?? 'assessed',
                numValue: item.numValue, boolValue: item.boolValue, strValue: item.strValue, note: item.note,
            })) as any, { transaction });
            await this.writeValueProjection(run, transaction);
            return run;
        };
        return outerTransaction?write(outerTransaction):this.analytics.sequelize.transaction(write);
    }

    private projection(run: QualityAnalysisRun) {
        const metrics = run.rawSnapshot.metrics ?? {};
        const corrections: any[] = run.rawSnapshot.overrides ?? [];
        const summary = (id: string) => corrections.find((item) => item.metricId === id && item.origin === 'summary');
        const qualitySummary = {
            csat: summary('csat')?.numValue ?? run.rawSnapshot.csat ?? metrics.csat ?? null,
            sentiment:
                summary('customer_sentiment')?.strValue ??
                run.rawSnapshot.sentiment ??
                metrics.customer_sentiment ??
                null,
            success: summary('success')?.boolValue ?? metrics.success ?? metrics.scenario_analysis?.success ?? null,
            successReason: summary('success')
                ? summary('success').note ?? null
                : metrics._assessments?.success?.rationale ?? null,
        };
        return {
            qualityRunId: run.id,
            qualitySummary,
            csat: qualitySummary.csat,
            sentiment: qualitySummary.sentiment,
            qualityScorecardId: run.scorecardRevisionId,
            qualityScore: run.result.score,
            qualityStatus: run.result.status,
            qualityCoverage: run.result.coverage,
            qualityVersion: run.result.formulaVersion,
            qualityContextIncomplete: run.result.contextIncomplete,
        };
    }

    private async writeValueProjection(run: QualityAnalysisRun, transaction: Transaction) {
        const rows: any[] = run.result.criteria.map((criterion) => ({
            channelId: run.channelId,
            userId: run.userId,
            projectId: run.projectId,
            schemaVersion: run.rawSnapshot.metrics?._schema_version ?? null,
            metricId: criterion.id,
            origin: criterion.origin,
            qualityRunId: run.id,
            qualityStatus: criterion.status,
            normalizedValue: criterion.normalized,
            qualityWeight: criterion.weight,
            contributesToQuality: criterion.included,
            numValue: typeof criterion.value === 'number' ? criterion.value : null,
            boolValue: typeof criterion.value === 'boolean' ? criterion.value : null,
            strValue: typeof criterion.value === 'string' ? criterion.value : null,
        }));
        const summary = this.projection(run).qualitySummary;
        for (const [id, value] of Object.entries({
            csat: summary.csat,
            customer_sentiment: summary.sentiment,
            success: summary.success,
        })) {
            if (value != null)
                rows.push({
                    channelId: run.channelId,
                    userId: run.userId,
                    projectId: run.projectId,
                    schemaVersion: run.rawSnapshot.metrics?._schema_version ?? null,
                    metricId: id,
                    origin: 'summary',
                    qualityRunId: run.id,
                    qualityStatus: 'assessed',
                    normalizedValue: null,
                    qualityWeight: null,
                    contributesToQuality: false,
                    numValue: typeof value === 'number' ? value : null,
                    boolValue: typeof value === 'boolean' ? value : null,
                    strValue: typeof value === 'string' ? value : null,
                });
        }
        await this.values.destroy({ where: { channelId: run.channelId, userId: run.userId }, transaction });
        if (rows.length) await this.values.bulkCreate(rows as any, { transaction });
    }

    async reviseOverrides(
        channelId: string,
        ownerId: string,
        actorId: string,
        changes: any[],
        deleteMetricId?: string
    ) {
        if (
            !Array.isArray(changes) ||
            changes.length > 100 ||
            changes.some(
                (change) =>
                    !change ||
                    typeof change !== 'object' ||
                    typeof change.metricId !== 'string' ||
                    !change.metricId ||
                    change.metricId.length > 150 ||
                    (change.origin && !['default', 'custom', 'summary'].includes(change.origin)) ||
                    (change.note != null && (typeof change.note !== 'string' || change.note.length > 5000))
            )
        )
            throw new BadRequestException('Invalid quality correction');
        return this.analytics.sequelize.transaction(async (transaction) => {
            const cdr = await this.cdrs.findOne({
                where: { channelId, userId: ownerId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!cdr) throw new NotFoundException('Quality record not found in scope');
            const analytics = await this.analytics.findOne({
                where: { channelId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!analytics?.qualityRunId)
                throw new ConflictException('Backfill this record before correcting its versioned score');
            const previous = await this.runs.findOne({
                where: { id: analytics.qualityRunId, channelId, userId: ownerId },
                transaction,
            });
            const revision =
                previous &&
                (await this.cards.findOne({
                    where: { id: previous.scorecardRevisionId, userId: ownerId },
                    transaction,
                }));
            if (!revision) throw new Error('Missing stored quality revision');
            if (deleteMetricId) {
                const deleted = await this.overrides.destroy({
                    where: { channelId, userId: ownerId, metricId: deleteMetricId },
                    transaction,
                });
                if (!deleted)
                    return {
                        overrides: await this.overrides.findAll({ where: { channelId, userId: ownerId }, transaction }),
                        deleted: 0,
                    };
            }
            for (const change of changes) {
                const status = change.status ?? 'assessed';
                if (!['assessed', 'not_applicable', 'insufficient_evidence'].includes(status))
                    throw new BadRequestException('Invalid applicability correction');
                const values = [change.numValue, change.boolValue, change.strValue].filter(
                    (value) => value !== undefined && value !== null
                );
                if (status === 'assessed' ? values.length !== 1 : values.length !== 0 || !change.note?.trim())
                    throw new BadRequestException(
                        'Assessed corrections need one value; applicability corrections need a reason and no value'
                    );
                const origin = change.origin || 'default';
                if (origin === 'summary' && status !== 'assessed')
                    throw new BadRequestException('Summary corrections require an observed value');
                if (
                    origin === 'summary' &&
                    !(
                        (change.metricId === 'csat' &&
                            Number.isInteger(change.numValue) &&
                            change.numValue >= 1 &&
                            change.numValue <= 5) ||
                        (change.metricId === 'customer_sentiment' &&
                            ['Positive', 'Neutral', 'Negative'].includes(change.strValue)) ||
                        (change.metricId === 'success' && typeof change.boolValue === 'boolean')
                    )
                )
                    throw new BadRequestException('Invalid summary correction');
                const rule = revision.snapshot.criteria.find((c) => c.id === change.metricId && c.origin === origin);
                if (!rule && origin !== 'summary')
                    throw new BadRequestException('Correction criterion is not in this evaluation');
                const payload = {
                    channelId,
                    userId: ownerId,
                    actorUserId: actorId,
                    metricId: change.metricId,
                    origin,
                    status,
                    numValue: change.numValue ?? null,
                    boolValue: change.boolValue ?? null,
                    strValue: change.strValue ?? null,
                    note: change.note ?? null,
                };
                const row = await this.overrides.findOne({
                    where: { channelId, metricId: change.metricId },
                    transaction,
                });
                if (row) await row.update(payload, { transaction });
                else await this.overrides.create(payload as any, { transaction });
            }
            const all = await this.overrides.findAll({ where: { channelId, userId: ownerId }, transaction });
            const corrections = all.map((row) => row.toJSON());
            const metrics = previous.rawSnapshot.metrics;
            const result = calculateQualityScore(revision.snapshot, metrics, corrections);
            // Invalid manual input is rejected atomically instead of silently lowering coverage.
            if (
                changes.some((change) =>
                    result.criteria.some(
                        (c) =>
                            c.id === change.metricId &&
                            c.origin === (change.origin || 'default') &&
                            ['invalid', 'missing'].includes(c.status)
                    )
                )
            )
                throw new BadRequestException('Invalid correction value for stored score scale');
            // Organizational moves do not replace the original evaluation's rubric/project provenance.
            const run = await this.saveRun(
                {
                    userId: ownerId,
                    projectId: previous.projectId,
                    channelId,
                    key: qualityHash({ correction: randomUUID(), previous: previous.id }),
                    kind: 'correction',
                    previousRunId: previous.id,
                    card: revision.snapshot,
                    raw: { ...previous.rawSnapshot, overrides: corrections, actorUserId: actorId },
                    result,
                },
                transaction
            );
            await analytics.update(this.projection(run), { transaction });
            await this.writeValueProjection(run, transaction);
            return { overrides: all, deleted: deleteMetricId ? 1 : 0 };
        });
    }

    async snapshotForClone(
        sourceChannelId: string,
        userId: string,
        projectId: number | null
    ): Promise<QualityScorecard> {
        const cdr = await this.cdrs.findOne({ where: { channelId: sourceChannelId, userId, projectId } });
        if (!cdr) throw new Error('Clone source not found in scope');
        const analytics = await this.analytics.findOne({ where: { channelId: sourceChannelId } });
        const run = analytics?.qualityRunId
            ? await this.runs.findOne({ where: { id: analytics.qualityRunId, userId, channelId: sourceChannelId } })
            : null;
        const card = run ? await this.cards.findOne({ where: { id: run.scorecardRevisionId, userId } }) : null;
        return (
            card?.snapshot ??
            createQualityScorecard({ id: projectId }, userId, {
                legacy: true,
                metrics: (analytics?.metrics as Record<string, any>) ?? {},
            })
        );
    }

    async history(channelId: string, userId: string, isAdmin: boolean, limit = 20, before?: string) {
        const cdr = await this.cdrs.findOne({
            where: { channelId, ...(!isAdmin ? { userId: String(userId) } : {}) },
            attributes: ['channelId', 'userId'],
        });
        if (!cdr) throw new NotFoundException('Quality record not found');
        const cursor = before
            ? await this.runs.findOne({
                  where: { id: before, channelId, userId: String(cdr.userId) },
                  attributes: ['id', 'createdAt'],
              })
            : null;
        if (before && !cursor) throw new BadRequestException('Invalid history cursor');
        const rows = await this.runs.findAll({
            where: {
                channelId,
                userId: String(cdr.userId),
                ...(cursor
                    ? {
                          [Op.or]: [
                              { createdAt: { [Op.lt]: cursor.createdAt } },
                              { createdAt: cursor.createdAt, id: { [Op.lt]: cursor.id } },
                          ],
                      }
                    : {}),
            },
            order: [
                ['createdAt', 'DESC'],
                ['id', 'DESC'],
            ],
            limit: Math.max(1, Math.min(100, limit)),
            attributes: ['id', 'previousRunId', 'scorecardRevisionId', 'kind', 'result', 'createdAt'],
        });
        return rows.map((row) => ({
            id: row.id,
            previousRunId: row.previousRunId,
            scorecardRevisionId: row.scorecardRevisionId,
            kind: row.kind,
            createdAt: row.createdAt,
            score: row.result.score,
            status: row.result.status,
            coverage: row.result.coverage,
            formulaVersion: row.result.formulaVersion,
            contextIncomplete: row.result.contextIncomplete,
        }));
    }

    async detail(channelId: string, userId: string, isAdmin: boolean, runId?: string): Promise<Record<string, any>> {
        const cdr = await this.cdrs.findOne({ where: { channelId, ...(!isAdmin ? { userId: String(userId) } : {}) }, ...(this.cdrs.associations?.billingRecords ? { include: [{ association: 'billingRecords' }] } : {}) });
        if (!cdr) throw new NotFoundException('Quality record not found');
        const analytics = await this.analytics.findOne({ where: { channelId } });
        const requestedId = runId || analytics?.qualityRunId;
        const run = requestedId
            ? await this.runs.findOne({ where: { id: requestedId, channelId, userId: String(cdr.userId) } })
            : null;
        if (runId && !run) throw new NotFoundException('Evaluation not found');
        const card = run
            ? await this.cards.findOne({ where: { id: run.scorecardRevisionId, userId: String(cdr.userId) } })
            : null;
        // Do not return internal prompts or full scorecard context to the browser.
        const operator =
            isOperatorAnalyticsSource(cdr.source) && Number.isSafeInteger(Number(channelId)) && this.operatorRecords
                ? await this.operatorRecords.findOne({
                      where: { id: Number(channelId), userId: String(cdr.userId) },
                      attributes: ['transcription', 'recordUrl'],
                  })
                : null;
        const record = {
            ...cdr.toJSON(),
            transcription: runId
                ? run?.rawSnapshot.input?.transcription ?? null
                : run?.rawSnapshot.input?.transcription ?? operator?.transcription ?? null,
            recordUrl: cdr.recordUrl || operator?.recordUrl || null,
        };
        const historicalAnalytics =
            runId && run
                ? {
                      channelId,
                      metrics: run.rawSnapshot.metrics,
                      summary: run.rawSnapshot.summary,
                      csat: run.rawSnapshot.csat,
                      sentiment: run.rawSnapshot.sentiment,
                      ...this.projection(run),
                  }
                : analytics?.toJSON() ?? null;
        const corrections = (run?.rawSnapshot.overrides ?? []).map(
            ({ metricId, origin, status, numValue, boolValue, strValue, note }: any) => ({
                metricId,
                origin,
                status,
                numValue,
                boolValue,
                strValue,
                note,
            })
        );
        return {
            record,
            analytics: historicalAnalytics,
            corrections,
            evaluation: run
                ? {
                      id: run.id,
                      previousRunId: run.previousRunId,
                      result: run.result,
                      kind: run.kind,
                      createdAt: run.createdAt,
                      scorecardRevisionId: run.scorecardRevisionId,
                  }
                : null,
            criteria: card?.snapshot.criteria ?? [],
            minimumCoverage: card?.snapshot.minimumCoverage ?? null,
        };
    }

    /** Reinterpret saved answers without AI; preserve original JSON and an immutable baseline. */
    async backfill(channelId: string, userId: string, apply = false) {
        const cdr = await this.cdrs.findOne({ where: { channelId, userId: String(userId) } });
        const analytics = cdr ? await this.analytics.findOne({ where: { channelId } }) : null;
        if (!cdr || !analytics) throw new Error('Quality record not found in scope');
        if (analytics.qualityRunId) return { changed: false, alreadyPublished: true };
        const card = createQualityScorecard({ id: cdr.projectId }, String(userId), {
            legacy: true,
            metrics: analytics.metrics as Record<string, any>,
        });
        const oldOverrides = (await this.overrides.findAll({ where: { channelId, userId: String(userId) } })).map(
            (row) => row.toJSON()
        );
        const result = calculateQualityScore(card, analytics.metrics as Record<string, any>, oldOverrides);
        if (!apply) return { changed: false, result, contextIncomplete: true };
        return this.analytics.sequelize.transaction(async (transaction) => {
            const frozenCdr = await this.cdrs.findOne({
                where: { channelId, userId: String(userId) },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!frozenCdr || (frozenCdr.projectId ?? null) !== (cdr.projectId ?? null))
                throw new ConflictException('Record project changed during backfill; retry the scoped batch');
            const locked = await this.analytics.findOne({
                where: { channelId },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!locked) throw new NotFoundException('Quality record not found in scope');
            if (locked.qualityRunId) return { changed: false, alreadyPublished: true };
            // Recompute from the locked snapshot so concurrent regeneration cannot be overwritten.
            const frozenCard = createQualityScorecard({ id: cdr.projectId }, String(userId), {
                legacy: true,
                metrics: locked.metrics as Record<string, any>,
            });
            const corrections = (
                await this.overrides.findAll({ where: { channelId, userId: String(userId) }, transaction })
            ).map((row) => row.toJSON());
            const frozenResult = calculateQualityScore(frozenCard, locked.metrics as Record<string, any>, corrections);
            const run = await this.saveRun(
                {
                    userId: String(userId),
                    projectId: cdr.projectId ?? null,
                    channelId,
                    key: qualityHash({
                        backfill: channelId,
                        owner: userId,
                        raw: locked.metrics,
                        formula: frozenCard.formulaVersion,
                    }),
                    kind: 'legacy_derived',
                    previousRunId: null,
                    card: frozenCard,
                    raw: {
                        metrics: locked.metrics,
                        overrides: corrections,
                        summary: locked.summary,
                        csat: locked.csat,
                        sentiment: locked.sentiment,
                        provenance: 'derived from historical answers; incomplete original rubric context',
                    },
                    result: frozenResult,
                },
                transaction
            );
            await locked.update(this.projection(run), { transaction });
            await this.writeValueProjection(run, transaction);
            return { changed: true, runId: run.id, result: frozenResult };
        });
    }
}
