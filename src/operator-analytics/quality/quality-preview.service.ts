import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AiAnalytics } from '../../ai-analytics/ai-analytics.model';
import { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { OperatorAnalytics } from '../operator-analytics.model';
import { OperatorProject } from '../operator-project.model';
import { MetricOverride } from '../operator-metric-override.model';
import { QualityScoringService } from './quality-scoring.service';
import { createQualityScorecard, qualityHash, QualityScoreConfig, QUALITY_FORMULA_VERSION } from './quality-score';
import { QualityPreviewAnalytics } from './quality-preview-analytics.model';
import { QualityPreviewValue } from './quality-preview-values.model';
import { QualityPreviewOverride } from './quality-preview-overrides.model';
import { QualityPreviewRun, QualityPreviewScorecard, QualityPreviewRules } from './quality-preview.models';

/** Historical PostgreSQL JSON can contain U+0000; JSONB snapshots cannot. Keep an encoded source alongside this observation copy. */
export function previewObservation<T>(value: T): T {
    if (typeof value === 'string') return value.replace(/\u0000/g, '') as T;
    if (Array.isArray(value)) return value.map(item => previewObservation(item)) as T;
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/\u0000/g, ''), previewObservation(item)])) as T;
    return value;
}

export function previewMetrics(value: unknown): Record<string, any> {
    let parsed = value;
    for (let depth = 0; depth < 2 && typeof parsed === 'string'; depth++) {
        try { parsed = JSON.parse(parsed); } catch { return {}; }
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? previewObservation(parsed) : {};
}

/** Separate storage, same calculator/transaction implementation; never swaps global model bindings. */
@Injectable()
export class QualityPreviewService {
    readonly scoring: QualityScoringService;
    constructor(
        @InjectModel(QualityPreviewRun) runs: typeof QualityPreviewRun,
        @InjectModel(QualityPreviewScorecard) cards: typeof QualityPreviewScorecard,
        @InjectModel(QualityPreviewAnalytics) private readonly preview: typeof QualityPreviewAnalytics,
        @InjectModel(QualityPreviewValue) values: typeof QualityPreviewValue,
        @InjectModel(QualityPreviewOverride) overrides: typeof QualityPreviewOverride,
        @InjectModel(QualityPreviewRules) private readonly configs: typeof QualityPreviewRules,
        @InjectModel(AiAnalytics) private readonly originals: typeof AiAnalytics,
        @InjectModel(AiCdr) private readonly cdrs: typeof AiCdr,
        @InjectModel(OperatorProject) private readonly projects: typeof OperatorProject,
        @InjectModel(OperatorAnalytics) operators: typeof OperatorAnalytics,
        @InjectModel(MetricOverride) private readonly originalOverrides: typeof MetricOverride,
    ) {
        this.scoring = new QualityScoringService(runs as any, cards as any, preview as any, cdrs,
            values as any, overrides as any, operators);
    }

    async authorize(channelId: string, userId: string, isAdmin: boolean) {
        const cdr = await this.cdrs.findOne({ where: { channelId, ...(!isAdmin ? { userId: String(userId) } : {}) } });
        if (!cdr) throw new NotFoundException('Preview record not found');
        return cdr;
    }

    /** Deterministic reinterpretation only. No model request and no legacy write. */
    async ensure(channelId: string, userId: string, isAdmin = false) {
        const cdr = await this.authorize(channelId, userId, isAdmin);
        const original = await this.originals.findOne({ where: { channelId } });
        if (!original) return null;
        const existing = await this.preview.findOne({ where: { channelId } });
        // Existing revisions remain frozen when project rules change. Source changes make a new revision.
        const sourceHash = qualityHash({ metrics: original.metrics, summary: original.summary, csat: original.csat,
            sentiment: original.sentiment, updatedAt: original.updatedAt });
        if (existing?.metrics && (existing.metrics as any)._preview_source_hash === sourceHash) {
            if (existing.qualityVersion === QUALITY_FORMULA_VERSION) return existing;
            await this.scoring.refreshAppliedCriteria(channelId, String(cdr.userId));
            return this.preview.findOne({ where: { channelId } });
        }
        const project = cdr.projectId ? await this.projects.findOne({ where: { id: cdr.projectId, userId: String(cdr.userId) } }) : null;
        const config = project ? await this.configs.findOne({ where: { projectId: project.id, userId: String(cdr.userId) } }) : null;
        const sourceJson = JSON.stringify({ metrics: original.metrics, summary: original.summary, sentiment: original.sentiment, csat: original.csat });
        const metrics = previewMetrics(original.metrics);
        const legacy = createQualityScorecard({ id: cdr.projectId }, String(cdr.userId), { legacy: true, metrics });
        // Saved metadata supplies historical criterion definitions; current preview rules supply explicit weights.
        const card = createQualityScorecard({ id: cdr.projectId,
            visibleDefaultMetrics: legacy.criteria.filter(c => c.origin === 'default').map(c => c.id),
            customMetricsSchema: Object.entries(metrics._custom_meta ?? {}).map(([id, meta]) => ({ id, ...(meta as object) })),
            qualityScoreConfig: config ? { ...config.config, criteria: Object.fromEntries(Object.entries(config.config.criteria ?? {})
                .filter(([key]) => legacy.criteria.some(c => `${c.origin}:${c.id}` === key))) } : null,
        }, String(cdr.userId));
        card.provenance = 'legacy_derived';
        card.context = { ...legacy.context, preview: true, sourceHash, rulesAppliedAt: 'preview derivation' };
        metrics._preview_source_hash = sourceHash;
        await this.scoring.writeAnalysis({ channelId, userId: String(cdr.userId), projectId: cdr.projectId ?? null,
            operationId: `preview:${sourceHash}`, card,
            fields: { metrics, summary: original.summary, csat: original.csat, sentiment: original.sentiment },
            initialOverrides: !existing ? (await this.originalOverrides.findAll({ where: { channelId, userId: String(cdr.userId) } })).map(row => row.toJSON()) : [],
            inputSnapshot: { sourceHash, sourceJson, derivation: 'saved answers; no new AI request' } });
        return this.preview.findOne({ where: { channelId } });
    }

    async rules(projectId: number, userId: string, isAdmin: boolean, config?: QualityScoreConfig) {
        if (!Number.isSafeInteger(projectId) || projectId < 1) throw new BadRequestException('Invalid project');
        const project = await this.projects.findOne({ where: { id: projectId, ...(!isAdmin ? { userId: String(userId) } : {}) } });
        if (!project) throw new NotFoundException('Preview project not found');
        const existing = await this.configs.findOne({ where: { projectId, userId: String(project.userId) } });
        const effective = config ?? existing?.config ?? {};
        let card;
        try { card = createQualityScorecard({ ...project.get({ plain: true }), qualityScoreConfig: effective }, String(project.userId)); }
        catch (e) { throw new BadRequestException((e as Error).message); }
        if (config !== undefined) {
            if (existing) await existing.update({ config });
            else await this.configs.create({ projectId, userId: String(project.userId), config });
        }
        return { enabled: true, revisionId: qualityHash(card), minimumCoverage: card.minimumCoverage,
            criteria: card.criteria, config: effective };
    }
}
