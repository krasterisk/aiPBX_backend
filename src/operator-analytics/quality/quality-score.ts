import { createHash } from 'crypto';

export const QUALITY_FORMULA_VERSION = 'quality-v2.1';
export type CriterionStatus = 'assessed' | 'not_applicable' | 'insufficient_evidence' | 'missing' | 'invalid';
export interface CriterionRule {
    id: string;
    origin: 'default' | 'custom';
    name: string;
    type: 'number' | 'boolean' | 'enum' | 'string';
    weight: number;
    included: boolean;
    normalization:
        | { kind: 'linear'; min: number; max: number; inverted?: boolean }
        | { kind: 'points'; values: Record<string, number>; maxPoints: number }
        | { kind: 'none' };
    critical: 'none' | 'flag' | 'fail';
}
export interface QualityScoreConfig {
    minimumCoverage?: number;
    criteria?: Record<string, Partial<Pick<CriterionRule, 'weight' | 'included' | 'normalization' | 'critical'>>>;
}
export interface QualityScorecard {
    formulaVersion: typeof QUALITY_FORMULA_VERSION;
    userId: string;
    projectId: number | null;
    minimumCoverage: number;
    criteria: CriterionRule[];
    context: Record<string, unknown>;
    provenance: 'analysis' | 'legacy_derived';
}
export interface CriterionResult {
    source: 'model' | 'human' | 'legacy';
    id: string;
    origin: CriterionRule['origin'];
    status: CriterionStatus;
    value: unknown;
    normalized: number | null;
    weight: number;
    included: boolean;
    rationale?: string;
    quote?: string;
}
export interface QualityScoreResult {
    formulaVersion: string;
    score: number | null;
    candidateScore: number | null;
    status: 'scored' | 'needs_review' | 'unscorable';
    coverage: number;
    assessed: number;
    applicable: number;
    notApplicable: number;
    criticalStatus: 'pass' | 'fail' | 'unknown';
    contextIncomplete: boolean;
    criteria: CriterionResult[];
}

export function canonicalJson(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    return `{${Object.keys(value as object)
        .sort()
        .filter((k) => (value as any)[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as any)[k])}`)
        .join(',')}}`;
}
export const qualityHash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

export function validateQualityConfig(config: QualityScoreConfig | null | undefined): void {
    if (!config) return;
    if (typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid quality configuration');
    if (Object.keys(config).some((key) => !['minimumCoverage', 'criteria'].includes(key)))
        throw new Error('Unknown quality setting');
    if (
        config.minimumCoverage !== undefined &&
        (!Number.isFinite(config.minimumCoverage) || config.minimumCoverage < 0 || config.minimumCoverage > 1)
    )
        throw new Error('Coverage must be between zero and one');
    if (
        config.criteria != null &&
        (typeof config.criteria !== 'object' ||
            Array.isArray(config.criteria) ||
            Object.keys(config.criteria).length > 100)
    )
        throw new Error('Invalid quality criteria');
    for (const [id, rule] of Object.entries(config.criteria ?? {})) {
        if (!id || id.length > 150 || !rule || typeof rule !== 'object' || Array.isArray(rule))
            throw new Error('Invalid criterion rule');
        if (Object.keys(rule).some((key) => !['weight', 'included', 'normalization', 'critical'].includes(key)))
            throw new Error('Unknown criterion setting');
        if (rule.included !== undefined && typeof rule.included !== 'boolean') throw new Error('Invalid inclusion');
        if (rule.weight !== undefined && (!Number.isFinite(rule.weight) || rule.weight <= 0 || rule.weight > 1000))
            throw new Error('Invalid criterion weight');
        if (rule.critical !== undefined && !['none', 'flag', 'fail'].includes(rule.critical))
            throw new Error('Invalid critical policy');
        const n = rule.normalization;
        if (!n) continue;
        if (n.kind === 'linear') {
            if (
                !Number.isFinite(n.min) ||
                !Number.isFinite(n.max) ||
                !Number.isFinite(n.max - n.min) ||
                n.max <= n.min ||
                (n.inverted !== undefined && typeof n.inverted !== 'boolean')
            )
                throw new Error('Invalid score scale');
        } else if (n.kind === 'points') {
            if (
                !n.values ||
                typeof n.values !== 'object' ||
                Array.isArray(n.values) ||
                Object.keys(n.values).length > 100 ||
                !Number.isFinite(n.maxPoints) ||
                n.maxPoints <= 0
            )
                throw new Error('Invalid answer mapping');
            if (Object.values(n.values).some((v) => !Number.isFinite(v) || v < 0 || v > n.maxPoints))
                throw new Error('Invalid answer points');
        } else if (n.kind !== 'none') throw new Error('Unknown normalization');
    }
}

export function createQualityScorecard(
    project: any,
    userId: string,
    options: { legacy?: boolean; metrics?: Record<string, any>; promptVersion?: string } = {}
): QualityScorecard {
    const config: QualityScoreConfig = project?.qualityScoreConfig ?? {};
    validateQualityConfig(config);
    const metrics = options.metrics ?? {};
    const defaults = [
        'greeting_quality',
        'script_compliance',
        'politeness_empathy',
        'active_listening',
        'objection_handling',
        'product_knowledge',
        'problem_resolution',
        'speech_clarity_pace',
        'closing_quality',
    ];
    const keys = options.legacy
        ? defaults.filter((key) => typeof metrics[key] === 'number')
        : project?.visibleDefaultMetrics?.length
        ? project.visibleDefaultMetrics
        : defaults;
    const custom: any[] = options.legacy
        ? Object.entries(metrics._custom_meta ?? {}).map(([id, meta]) => ({ id, ...(meta as object) }))
        : project?.customMetricsSchema ?? [];
    const criteria: CriterionRule[] = keys.map((id: string) => ({
        id,
        name: id,
        origin: 'default',
        type: 'number',
        weight: 1,
        included: true,
        normalization: { kind: 'linear', min: 0, max: 100 },
        critical: 'none',
    }));
    for (const def of custom) {
        const normalization: CriterionRule['normalization'] =
            def.type === 'boolean'
                ? {
                      kind: 'points',
                      values: def.polarity === 'negative' ? { true: 0, false: 1 } : { true: 1, false: 0 },
                      maxPoints: 1,
                  }
                : def.type === 'number' && Number.isFinite(def.min) && Number.isFinite(def.max) && def.max > def.min
                ? { kind: 'linear', min: def.min, max: def.max, inverted: def.polarity === 'negative' }
                : { kind: 'none' };
        // Custom data is opt-in: business counts, money and free text are not implicit quality metrics.
        criteria.push({
            id: def.id,
            origin: 'custom',
            name: def.name || def.id,
            type: def.type,
            weight: 1,
            included: Boolean(options.legacy && normalization.kind !== 'none'),
            normalization,
            critical: 'none',
        });
    }
    const ids = new Set<string>();
    for (const criterion of criteria) {
        const key = `${criterion.origin}:${criterion.id}`;
        if (ids.has(key)) throw new Error('Duplicate criterion');
        ids.add(key);
        if (!options.legacy) {
            const override = config.criteria?.[key];
            for (const field of ['weight', 'included', 'normalization', 'critical'] as const) {
                if (override?.[field] !== undefined)
                    (criterion as any)[field] = JSON.parse(canonicalJson(override[field]));
            }
        }
        if (criterion.included && criterion.normalization.kind === 'none')
            throw new Error(`Criterion ${key} requires a score mapping`);
        if (criterion.normalization.kind === 'linear' && criterion.type !== 'number')
            throw new Error('Linear scales require a numeric criterion');
        if (
            criterion.normalization.kind === 'points' &&
            !Object.keys(criterion.normalization.values).length &&
            criterion.included
        )
            throw new Error('Included criteria require answer points');
        if (!criterion.included && criterion.critical !== 'none') throw new Error('Critical criteria must be included');
    }
    if (!options.legacy && Object.keys(config.criteria ?? {}).some((key) => !ids.has(key)))
        throw new Error('Unknown scoring criterion');
    return {
        formulaVersion: QUALITY_FORMULA_VERSION,
        userId: String(userId),
        projectId: project?.id == null ? null : Number(project.id),
        minimumCoverage: config.minimumCoverage ?? 0.8,
        criteria,
        provenance: options.legacy ? 'legacy_derived' : 'analysis',
        context: JSON.parse(
            canonicalJson(
                options.legacy
                    ? {
                          schemaVersion: metrics._schema_version ?? null,
                          promptVersion: metrics._model?.promptVersion ?? null,
                          customMeta: metrics._custom_meta ?? null,
                      }
                    : {
                          schemaVersion: project?.currentSchemaVersion ?? null,
                          promptVersion: options.promptVersion ?? null,
                          systemPrompt: project?.systemPrompt ?? null,
                          successPrompt: project?.successPrompt ?? null,
                          customMetricsSchema: custom,
                          callTaxonomy: project?.callTaxonomy ?? [],
                          topicScheme: project?.topicSchemeState?.active ?? null,
                      }
            )
        ),
    };
}

function normalizedValue(value: unknown, rule: CriterionRule): number | null {
    if (
        (rule.type === 'number' && typeof value !== 'number') ||
        (rule.type === 'boolean' && typeof value !== 'boolean') ||
        (['enum', 'string'].includes(rule.type) && typeof value !== 'string')
    )
        return null;
    const n = rule.normalization;
    if (n.kind === 'linear') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < n.min || value > n.max) return null;
        const part = (value - n.min) / (n.max - n.min);
        return n.inverted ? 1 - part : part;
    }
    if (n.kind === 'points') {
        if (
            !['string', 'number', 'boolean'].includes(typeof value) ||
            !Object.prototype.hasOwnProperty.call(n.values, String(value))
        )
            return null;
        return n.values[String(value)] / n.maxPoints;
    }
    return null;
}

export function calculateQualityScore(
    card: QualityScorecard,
    metrics: Record<string, any>,
    overrides: Array<{
        metricId: string;
        origin?: string;
        numValue?: number | null;
        boolValue?: boolean | null;
        strValue?: string | null;
        status?: CriterionStatus;
        note?: string;
    }> = []
): QualityScoreResult {
    metrics = metrics && typeof metrics === 'object' && !Array.isArray(metrics) ? metrics : {};
    let assessedWeight = 0,
        possibleWeight = 0,
        earned = 0,
        criticalUnknown = false,
        criticalFail = false,
        fatal = false;
    const criteria: CriterionResult[] = card.criteria.map((rule) => {
        const correction = overrides.find((o) => o.metricId === rule.id && (o.origin ?? 'default') === rule.origin);
        const raw = rule.origin === 'custom' ? metrics.custom_metrics?.[rule.id] : metrics[rule.id];
        const value = correction ? correction.numValue ?? correction.boolValue ?? correction.strValue ?? null : raw;
        const declared = correction
            ? correction.status ?? 'assessed'
            : metrics._criterion_statuses?.[`${rule.origin}:${rule.id}`] ?? metrics._criterion_statuses?.[rule.id];
        let status: CriterionStatus =
            declared ?? (card.provenance === 'legacy_derived' && value != null ? 'assessed' : 'missing');
        if (!['assessed', 'not_applicable', 'insufficient_evidence', 'missing', 'invalid'].includes(status))
            status = 'invalid';
        const normalized = status === 'assessed' ? normalizedValue(value, rule) : null;
        if (status === 'assessed' && normalized == null && rule.included)
            status = value == null ? 'missing' : 'invalid';
        if (rule.included) {
            if (status !== 'not_applicable') possibleWeight += rule.weight;
            if (status === 'assessed' && normalized != null) {
                assessedWeight += rule.weight;
                earned += rule.weight * normalized;
            }
            if (rule.critical !== 'none' && status !== 'not_applicable') {
                if (status !== 'assessed') criticalUnknown = true;
                else if (normalized === 0) {
                    criticalFail = true;
                    if (rule.critical === 'fail') fatal = true;
                }
            }
        }
        const assessment = correction ? { rationale: correction.note } : metrics._assessments?.[rule.id];
        const quote = correction ? undefined : assessment?.quote || metrics._evidence?.[rule.id];
        return {
            id: rule.id,
            origin: rule.origin,
            status,
            source: correction ? 'human' : card.provenance === 'legacy_derived' ? 'legacy' : 'model',
            value: value ?? null,
            normalized: status === 'assessed' ? normalized : null,
            weight: rule.weight,
            included: rule.included,
            ...(assessment?.rationale ? { rationale: assessment.rationale } : {}),
            ...(quote ? { quote } : {}),
        };
    });
    const coverage = possibleWeight ? assessedWeight / possibleWeight : 0;
    const candidateScore = assessedWeight ? (100 * earned) / assessedWeight : null;
    const quality = metrics._quality?.quality;
    const unscorable = !assessedWeight || quality === 'low' || quality === 'unusable';
    const contextIncomplete = card.provenance === 'legacy_derived';
    const status = unscorable
        ? 'unscorable'
        : coverage < card.minimumCoverage || criticalUnknown
        ? 'needs_review'
        : 'scored';
    return {
        formulaVersion: QUALITY_FORMULA_VERSION,
        score: status === 'scored' ? (fatal ? 0 : candidateScore) : null,
        candidateScore,
        status,
        coverage,
        assessed: criteria.filter((r) => r.included && r.status === 'assessed').length,
        applicable: criteria.filter((r) => r.included && r.status !== 'not_applicable').length,
        notApplicable: criteria.filter((r) => r.included && r.status === 'not_applicable').length,
        criticalStatus: criticalFail ? 'fail' : criticalUnknown ? 'unknown' : 'pass',
        contextIncomplete,
        criteria,
    };
}

export function averagePublishedQuality(
    rows: Array<{ analytics?: { qualityScore?: number | null; qualityStatus?: string } }>
): number | null {
    const values = rows
        .map((r) => (r.analytics?.qualityStatus === 'scored' ? r.analytics.qualityScore : null))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}
