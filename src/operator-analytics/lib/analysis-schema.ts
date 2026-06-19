import { z } from 'zod';
import {
    ALL_DEFAULT_METRIC_KEYS,
    CustomMetricDef,
    DefaultMetricKey,
    MetricDefinition,
    MetricPolarity,
    StoredMetricMeta,
} from '../interfaces/operator-metrics.interface';
import type { OperatorProject } from '../operator-project.model';

export const SCORE_ANCHOR_INSTRUCTION =
    'Scores: 0|25|50|75|100 only (0=absent, 25=poor, 50=adequate, 75=good, 100=all checklist items present).';

/** When a metric rubric lists required elements, 100 means the checklist is complete — not "extra excellent". */
export const FULL_SCORE_INSTRUCTION =
    'Give 100 when every checklist item is clearly present (synonyms OK, e.g. "Добрый день" = greeting). Below 100: name the missing item. Rationale: 1 short sentence in transcript language, paraphrase behavior; verbatim text only in quote. No boilerplate ("соответствует требованиям", "все элементы присутствуют", "уровень 75").';

export const OUTPUT_LANGUAGE_INSTRUCTION =
    'LANGUAGE: ALL prose (summary, every rationale, quotes) MUST be in the transcript language — detect from TRANSCRIPTION above. ru/de/zh transcript → write ru/de/zh. Use English prose ONLY if the transcript is predominantly English. JSON keys and enums (Positive/Neutral/Negative) stay English.';

const CHECKLIST_SCORE_MAP =
    'Checklist map: 100=all items (N/A items count as present), 75=3/4, 50=2/4, 25=1/4, 0=none.';

const NA_AS_PRESENT_NOTE =
    'N/A items (e.g. no objection raised) count as present.';

/** Compact checklist — scoring rules live once in buildAnalysisPrompt (GLOBAL SCORING). */
function buildCompactRubric(title: string, elements: string[], note?: string): string {
    const items = elements.map((el, i) => `${i + 1})${el}`).join('; ');
    return note ? `${title} {${note}} ${items}` : `${title} ${items}`;
}

const GREETING_QUALITY_RUBRIC = buildCompactRubric(
    'Greeting/ID:',
    [
        'polite opener (Здравствуйте/Добрый день/Hello)',
        'org/company name',
        'operator name or role',
        'offer to help',
    ],
);

const SCRIPT_COMPLIANCE_RUBRIC = buildCompactRubric(
    'Script:',
    [
        'standard opening (+ BUSINESS CONTEXT if set)',
        'clarify customer need before acting',
        'required verification/disclosures when applicable',
        'workflow to resolution/close',
    ],
    'BUSINESS CONTEXT steps are extra required items',
);

const POLITENESS_EMPATHY_RUBRIC = buildCompactRubric(
    'Politeness:',
    [
        'please/thank-you forms used',
        'acknowledge concern when customer upset',
        'no rude/dismissive/interrupting language',
        'respectful professional tone',
    ],
    'item 3 satisfied if no bad language',
);

const ACTIVE_LISTENING_RUBRIC = buildCompactRubric(
    'Listening:',
    [
        'clarifying Q or restate request',
        'confirm understanding before acting',
        'responses match customer input',
        'answers direct questions, no ignoring',
    ],
);

const OBJECTION_HANDLING_RUBRIC = buildCompactRubric(
    'Objections:',
    [
        'acknowledge objection',
        'explain/alternative/next step',
        'stay calm/professional',
        'move toward resolution',
    ],
    'no objection → score 100',
);

const PRODUCT_KNOWLEDGE_RUBRIC = buildCompactRubric(
    'Knowledge:',
    [
        'specific answers, not vague evasion',
        'consistent/plausible info',
        'explain options/steps/pricing when needed',
        'if unsure: admit + lookup/escalate',
    ],
);

const PROBLEM_RESOLUTION_RUBRIC = buildCompactRubric(
    'Resolution:',
    [
        'identify problem/request',
        'concrete action taken',
        'confirm outcome/next step',
        'resolved in-call OR clear next step agreed',
    ],
);

const SPEECH_CLARITY_PACE_RUBRIC = buildCompactRubric(
    'Speech:',
    [
        'coherent understandable turns',
        'no excessive filler blocking meaning',
        'appropriately sized responses',
        'key numbers/dates/names clear in transcript',
    ],
    'judge transcript only, not accent/STT noise',
);

const CLOSING_QUALITY_RUBRIC = buildCompactRubric(
    'Closing:',
    [
        'summarize done/next steps',
        'ask if anything else needed',
        'thank customer',
        'polite farewell',
    ],
);

/**
 * Versioned identifier of the analysis prompt + rubric artifact.
 * Bump this whenever the prompt text, rubric anchors, or output schema change so
 * that historical analyses remain comparable and offline evals can be tied to a
 * specific prompt revision. Stored on each record (DB column + metrics._model).
 * Format: YYYY-MM-DD.N (date of change + same-day revision counter).
 */
export const PROMPT_VERSION = '2026-06-19.3';

export interface MetricAssessment {
    rationale: string;
    quote: string;
}

/** Summary-level outputs that also get a rationale (beyond the scored metrics). */
export const SUMMARY_ASSESSMENT_KEYS = ['csat', 'customer_sentiment', 'success'] as const;

export const METRIC_RUBRIC_DESCRIPTIONS: Record<DefaultMetricKey, string> = {
    greeting_quality: GREETING_QUALITY_RUBRIC,
    script_compliance: SCRIPT_COMPLIANCE_RUBRIC,
    politeness_empathy: POLITENESS_EMPATHY_RUBRIC,
    active_listening: ACTIVE_LISTENING_RUBRIC,
    objection_handling: OBJECTION_HANDLING_RUBRIC,
    product_knowledge: PRODUCT_KNOWLEDGE_RUBRIC,
    problem_resolution: PROBLEM_RESOLUTION_RUBRIC,
    speech_clarity_pace: SPEECH_CLARITY_PACE_RUBRIC,
    closing_quality: CLOSING_QUALITY_RUBRIC,
};

export interface AnalysisCustomMetric {
    id: string;
    name?: string;
    type: string;
    description: string;
    enumValues?: string[];
    min?: number;
    max?: number;
    unit?: string;
    polarity?: MetricPolarity;
}

export interface AnalysisBuildContext {
    visibleDefaultMetrics: DefaultMetricKey[];
    customMetrics: AnalysisCustomMetric[];
}

/** Parse a numeric range hint like "от 0 до 10", "0-10", "1 to 5" from free text. */
export function inferNumberRange(text?: string): { min?: number; max?: number } {
    if (!text) return {};
    // Matches "от 0 до 10", "0 до 10", "1 to 5", "0-100", "0 – 100"
    const re = /(-?\d+(?:[.,]\d+)?)\s*(?:до|to|[-–—])\s*(-?\d+(?:[.,]\d+)?)/i;
    const m = text.match(re);
    if (m) {
        const min = parseFloat(m[1].replace(',', '.'));
        const max = parseFloat(m[2].replace(',', '.'));
        if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
            return { min, max };
        }
    }
    return {};
}

/** Resolve the effective numeric scale for a custom metric (explicit > inferred > default 0-100). */
export function resolveMetricRange(metric: AnalysisCustomMetric): { min: number; max: number } {
    if (typeof metric.min === 'number' && typeof metric.max === 'number' && metric.max > metric.min) {
        return { min: metric.min, max: metric.max };
    }
    const inferred = inferNumberRange(metric.description);
    return {
        min: inferred.min ?? 0,
        max: inferred.max ?? 100,
    };
}

/**
 * Validate LLM-produced custom-metric values against the project schema.
 * Invalid values (wrong type, enum not in list, number out of range) are set to
 * `null` and reported in `invalid` rather than failing the whole analysis.
 */
export function sanitizeCustomMetricValues(
    raw: Record<string, any> | null | undefined,
    ctx: AnalysisBuildContext,
): { values: Record<string, any> | null; invalid: string[] } {
    if (!raw || typeof raw !== 'object') return { values: null, invalid: [] };

    const values: Record<string, any> = {};
    const invalid: string[] = [];

    for (const metric of ctx.customMetrics) {
        if (!(metric.id in raw)) continue;
        const v = raw[metric.id];
        if (v === null || v === undefined) {
            values[metric.id] = null;
            continue;
        }

        switch (metric.type) {
            case 'boolean': {
                if (typeof v === 'boolean') values[metric.id] = v;
                else if (v === 'true' || v === 'false') values[metric.id] = v === 'true';
                else { values[metric.id] = null; invalid.push(metric.id); }
                break;
            }
            case 'number': {
                const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
                if (!Number.isFinite(n)) {
                    values[metric.id] = null;
                    invalid.push(metric.id);
                    break;
                }
                const { min, max } = resolveMetricRange(metric);
                if (n < min || n > max) {
                    values[metric.id] = null;
                    invalid.push(metric.id);
                } else {
                    values[metric.id] = n;
                }
                break;
            }
            case 'enum': {
                const allowed = metric.enumValues || [];
                if (allowed.length === 0 || allowed.includes(String(v))) {
                    values[metric.id] = String(v);
                } else {
                    values[metric.id] = null;
                    invalid.push(metric.id);
                }
                break;
            }
            default:
                values[metric.id] = typeof v === 'string' ? v : String(v);
        }
    }

    return { values: Object.keys(values).length ? values : null, invalid };
}

/** Build the metadata snapshot stored alongside an analysis result. */
export function buildCustomMetricMeta(ctx: AnalysisBuildContext): Record<string, StoredMetricMeta> {
    const meta: Record<string, StoredMetricMeta> = {};
    for (const m of ctx.customMetrics) {
        const entry: StoredMetricMeta = {
            name: m.name,
            type: m.type as StoredMetricMeta['type'],
            unit: m.unit,
            polarity: m.polarity ?? (m.type === 'number' ? 'positive' : 'neutral'),
            enumValues: m.enumValues,
        };
        if (m.type === 'number') {
            const { min, max } = resolveMetricRange(m);
            entry.min = min;
            entry.max = max;
        }
        meta[m.id] = entry;
    }
    return meta;
}

export function resolveVisibleDefaultMetrics(project?: OperatorProject | null): DefaultMetricKey[] {
    const visible = project?.visibleDefaultMetrics;
    if (visible?.length) return visible;
    return [...ALL_DEFAULT_METRIC_KEYS];
}

export function buildAnalysisContext(
    project?: OperatorProject | null,
    customMetricsDef?: CustomMetricDef[],
): AnalysisBuildContext {
    const customMetrics: AnalysisCustomMetric[] = project?.customMetricsSchema?.length
        ? project.customMetricsSchema.map(m => ({
            id: m.id,
            name: m.name,
            type: m.type,
            description: m.description,
            enumValues: m.enumValues,
            min: m.min,
            max: m.max,
            unit: m.unit,
            polarity: m.polarity,
        }))
        : (customMetricsDef || []).map(m => ({
            id: m.name,
            name: m.name,
            type: m.type,
            description: m.description,
        }));

    return {
        visibleDefaultMetrics: resolveVisibleDefaultMetrics(project),
        customMetrics,
    };
}

function scoreSchema() {
    return z.number().int().min(0).max(100);
}

function customMetricValueSchema(def: { type: string; enumValues?: string[] }) {
    // Structural validation only — generation is constrained by the OpenAI json_schema,
    // and semantic checks (enum membership, number range) are handled by
    // sanitizeCustomMetricValues so a single bad value never fails the whole analysis.
    switch (def.type) {
        case 'boolean':
            return z.union([z.boolean(), z.literal('true'), z.literal('false')]).nullable();
        case 'number':
            return z.union([z.number(), z.string()]).nullable();
        case 'enum':
            return z.string().nullable();
        default:
            return z.string().nullable();
    }
}

function assessmentSchema() {
    return z.object({
        rationale: z.string(),
        quote: z.string(),
    });
}

export function buildZodAnalysisSchema(ctx: AnalysisBuildContext) {
    const shape: Record<string, z.ZodTypeAny> = {};

    // Reason-before-score: assessments are produced before the numeric scores.
    const assessmentShape: Record<string, z.ZodTypeAny> = {};
    for (const key of ctx.visibleDefaultMetrics) {
        assessmentShape[key] = assessmentSchema();
    }
    for (const metric of ctx.customMetrics) {
        assessmentShape[metric.id] = assessmentSchema();
    }
    for (const key of SUMMARY_ASSESSMENT_KEYS) {
        assessmentShape[key] = assessmentSchema();
    }
    shape.assessments = z.object(assessmentShape).partial();

    for (const key of ctx.visibleDefaultMetrics) {
        shape[key] = scoreSchema();
    }

    shape.customer_sentiment = z.enum(['Positive', 'Neutral', 'Negative']);
    shape.csat = z.number().int().min(1).max(5);
    shape.summary = z.string();
    shape.success = z.boolean();
    shape.analysis_confidence = z.number().min(0).max(1);
    shape.insufficient_content = z.boolean();
    shape.diarized_text = z.array(z.object({
        speaker: z.enum(['operator', 'customer']),
        text: z.string(),
    }));

    if (ctx.customMetrics.length) {
        const customShape: Record<string, z.ZodTypeAny> = {};
        for (const metric of ctx.customMetrics) {
            customShape[metric.id] = customMetricValueSchema(metric);
        }
        shape.custom_metrics = z.object(customShape).partial();
    }

    return z.object(shape);
}

export function buildOpenAiJsonSchema(ctx: AnalysisBuildContext) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Reason-before-score: assessments come first so the model reasons before
    // committing to a numeric score (G-Eval style chain-of-thought).
    const assessmentItemSchema = {
        type: 'object',
        properties: {
            rationale: { type: 'string' },
            quote: { type: 'string' },
        },
        required: ['rationale', 'quote'],
        additionalProperties: false,
    };
    const assessmentProps: Record<string, unknown> = {};
    const assessmentRequired: string[] = [];
    for (const key of ctx.visibleDefaultMetrics) {
        assessmentProps[key] = assessmentItemSchema;
        assessmentRequired.push(key);
    }
    for (const metric of ctx.customMetrics) {
        assessmentProps[metric.id] = assessmentItemSchema;
        assessmentRequired.push(metric.id);
    }
    for (const key of SUMMARY_ASSESSMENT_KEYS) {
        assessmentProps[key] = assessmentItemSchema;
        assessmentRequired.push(key);
    }
    properties.assessments = {
        type: 'object',
        properties: assessmentProps,
        required: assessmentRequired,
        additionalProperties: false,
    };
    required.push('assessments');

    for (const key of ctx.visibleDefaultMetrics) {
        properties[key] = { type: 'integer', minimum: 0, maximum: 100 };
        required.push(key);
    }

    properties.customer_sentiment = { type: 'string', enum: ['Positive', 'Neutral', 'Negative'] };
    properties.csat = { type: 'integer', minimum: 1, maximum: 5 };
    properties.summary = { type: 'string' };
    properties.success = { type: 'boolean' };
    properties.analysis_confidence = { type: 'number', minimum: 0, maximum: 1 };
    properties.insufficient_content = { type: 'boolean' };
    properties.diarized_text = {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                speaker: { type: 'string', enum: ['operator', 'customer'] },
                text: { type: 'string' },
            },
            required: ['speaker', 'text'],
            additionalProperties: false,
        },
    };

    if (ctx.customMetrics.length) {
        const customProps: Record<string, unknown> = {};
        const customRequired: string[] = [];
        for (const metric of ctx.customMetrics) {
            switch (metric.type) {
                case 'boolean':
                    customProps[metric.id] = { type: 'boolean' };
                    break;
                case 'number':
                    customProps[metric.id] = { type: 'number' };
                    break;
                case 'enum':
                    customProps[metric.id] = metric.enumValues?.length
                        ? { type: 'string', enum: metric.enumValues }
                        : { type: 'string' };
                    break;
                default:
                    customProps[metric.id] = { type: 'string' };
            }
            customRequired.push(metric.id);
        }
        properties.custom_metrics = {
            type: 'object',
            properties: customProps,
            required: customRequired,
            additionalProperties: false,
        };
        required.push('custom_metrics');
    }

    required.push(
        'customer_sentiment', 'csat', 'summary', 'success',
        'analysis_confidence', 'insufficient_content', 'diarized_text',
    );

    return {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
    };
}

export function buildAnalysisPrompt(
    transcription: string,
    ctx: AnalysisBuildContext,
    options?: {
        systemPrompt?: string | null;
        qualityHintConfidence?: number;
    },
): string {
    const metricLines = ctx.visibleDefaultMetrics.map((key, index) => {
        return `${index + 1}. ${key}: ${METRIC_RUBRIC_DESCRIPTIONS[key]}`;
    }).join('\n');

    const assessmentKeys = [
        ...ctx.visibleDefaultMetrics,
        ...ctx.customMetrics.map(m => m.id),
        ...SUMMARY_ASSESSMENT_KEYS,
    ];

    let customMetricsPromptBlock = '';
    if (ctx.customMetrics.length) {
        const customDefs = ctx.customMetrics.map(m => {
            let typeDef = m.type;
            if (m.type === 'enum' && m.enumValues?.length) {
                typeDef = `enum:${m.enumValues.join('|')}`;
            } else if (m.type === 'number') {
                const { min, max } = resolveMetricRange(m);
                typeDef = `number ${min}..${max}`;
            }
            return `${m.id} (${typeDef}): ${m.description}`;
        }).join('; ');
        customMetricsPromptBlock = `\nCustom metrics (also in assessments + custom_metrics): ${customDefs}`;
    }

    const businessContext = options?.systemPrompt
        ? `\nBUSINESS CONTEXT: ${options.systemPrompt}`
        : '';

    const qualityHintBlock = options?.qualityHintConfidence != null
        ? `\nLOW STT CONFIDENCE (${options.qualityHintConfidence}): if unreliable, set insufficient_content=true, analysis_confidence<0.4; do not invent scores.`
        : '';

    const metricJsonLines = ctx.visibleDefaultMetrics
        .map(key => `  "${key}": <0|25|50|75|100>`)
        .join(',\n');

    const globalScoring = [
        'GLOBAL SCORING:',
        SCORE_ANCHOR_INSTRUCTION,
        CHECKLIST_SCORE_MAP,
        NA_AS_PRESENT_NOTE,
        FULL_SCORE_INSTRUCTION,
    ].join(' ');

    return `
QA analyst. Score operator call from transcript. JSON only.
${businessContext}${qualityHintBlock}
TRANSCRIPTION:
${transcription}

${OUTPUT_LANGUAGE_INSTRUCTION}

${globalScoring}

SCORING ORDER: (1) fill assessments for: ${assessmentKeys.join(', ')} — rationale + summary in transcript language first, then scores; (2) assign numeric scores consistent with rationale.

JSON shape:
{
  "assessments": { "<key>": { "rationale": "<1 short sentence, transcript language>", "quote": "<snippet or empty>" }, ... },
${metricJsonLines}${metricJsonLines ? ',' : ''}
  "customer_sentiment": "Positive|Neutral|Negative",
  "csat": <1-5>,
  "summary": "<brief call summary, transcript language>",
  "success": <boolean>,
  "analysis_confidence": <0-1>,
  "insufficient_content": <boolean>,
  "diarized_text": [{ "speaker": "operator|customer", "text": "..." }]${ctx.customMetrics.length ? ',\n  "custom_metrics": { ... }' : ''}
}

Metric checklists (4 items each unless noted):
${metricLines}
${customMetricsPromptBlock}

diarized_text: preserve full original text; speakers lowercase English operator|customer.
Return ONLY JSON.
`.trim();
}

export class AnalysisSchemaValidationError extends Error {
    constructor(message: string, public readonly rawContent?: string) {
        super(message);
        this.name = 'AnalysisSchemaValidationError';
    }
}

export function parseAndValidateAnalysisResponse(
    rawContent: string,
    ctx: AnalysisBuildContext,
    sanitize: (raw: string) => string,
) {
    const sanitized = sanitize(rawContent);
    let parsed: unknown;
    try {
        parsed = JSON.parse(sanitized);
    } catch {
        throw new AnalysisSchemaValidationError('LLM response is not valid JSON', rawContent);
    }

    const schema = buildZodAnalysisSchema(ctx);
    const result = schema.safeParse(parsed);
    if (!result.success) {
        throw new AnalysisSchemaValidationError(
            result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
            rawContent,
        );
    }

    const data = result.data as Record<string, any>;
    const { values: customMetricsResult, invalid: customMetricsInvalid } =
        sanitizeCustomMetricValues(data.custom_metrics || null, ctx);
    const assessments = (data.assessments || null) as Record<string, MetricAssessment> | null;
    const diarizedRaw = data.diarized_text || null;
    const analysisConfidence = data.analysis_confidence;
    const insufficientContent = data.insufficient_content;

    delete data.custom_metrics;
    delete data.assessments;
    delete data.diarized_text;
    delete data.analysis_confidence;
    delete data.insufficient_content;

    return {
        metrics: data,
        customMetricsResult,
        customMetricsInvalid,
        assessments,
        diarizedRaw,
        analysisConfidence,
        insufficientContent,
    };
}
