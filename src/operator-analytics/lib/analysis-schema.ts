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
    'Use ONLY discrete scores 0, 25, 50, 75, or 100. 0=absent/unacceptable, 25=poor, 50=adequate, 75=good, 100=all required rubric elements present.';

/** When a metric rubric lists required elements, 100 means the checklist is complete — not "extra excellent". */
export const FULL_SCORE_INSTRUCTION =
    'Assign 100 when every required element in that metric\'s rubric is clearly present in the transcript. Do not withhold 100 for subjective preferences (tone, enthusiasm, brevity, or alternative wording). For scores below 100, name a concrete required element that is absent — never invent a gap or treat synonymous phrases as missing (e.g. "Добрый день" satisfies the greeting element). The rationale must not claim an element is missing if the quote contains it.';

const NA_AS_PRESENT_NOTE =
    'If a listed element is not applicable to this call (e.g. no objection occurred), count it as present.';

function buildChecklistRubric(
    title: string,
    elements: string[],
    options?: { scope?: string; notes?: string[] },
): string {
    const scope = options?.scope ?? 'Required elements (count how many are clearly present):';
    const numbered = elements.map((el, i) => `(${i + 1}) ${el}`).join('; ');
    return [
        title,
        SCORE_ANCHOR_INSTRUCTION,
        scope,
        numbered + '.',
        '100 = all 4 elements present (or N/A elements counted as present per rubric notes). 75 = 3 of 4. 50 = 2 of 4. 25 = 1 of 4 or a very weak attempt. 0 = absent/unacceptable.',
        NA_AS_PRESENT_NOTE,
        ...(options?.notes ?? []),
        FULL_SCORE_INSTRUCTION,
    ].join(' ');
}

const GREETING_QUALITY_RUBRIC = buildChecklistRubric(
    'Greeting and identification quality.',
    [
        'verbal greeting — any polite opener such as "Здравствуйте", "Добрый день", "Доброе утро/вечер", "Hello", etc.',
        'organization/company/clinic name',
        'operator name or role identification ("меня зовут …", "оператор …")',
        'readiness to help — e.g. "слушаю вас", "чем могу помочь", "how can I help"',
    ],
    { scope: 'Required elements in the operator opening (count how many are clearly present):' },
);

const SCRIPT_COMPLIANCE_RUBRIC = buildChecklistRubric(
    'Script and guideline adherence across the call.',
    [
        'opening follows standard protocol (greeting, identification, offer to help); if BUSINESS CONTEXT defines a mandatory opening, that counts too',
        'clarifies the customer need before taking action (asks what happened / what they need)',
        'performs required verification or mandatory disclosures when the situation calls for them (identity check, terms, consent); if not needed for this call, count as present',
        'follows prescribed workflow to resolution/close (lookup → action → confirm), aligned with BUSINESS CONTEXT when provided',
    ],
    { notes: ['If BUSINESS CONTEXT lists mandatory script steps, treat them as required elements in addition to the above.'] },
);

const POLITENESS_EMPATHY_RUBRIC = buildChecklistRubric(
    'Politeness and empathy throughout the call.',
    [
        'uses polite forms (please/thank you / пожалуйста / спасибо / будьте добры) at least once',
        'acknowledges customer feelings or inconvenience when the customer expresses concern, frustration, or urgency',
        'no rude, dismissive, sarcastic, or interrupting language from the operator',
        'maintains a respectful, professional tone in operator turns (no hostility or condescension)',
    ],
    {
        scope: 'Required elements across the call (count how many are clearly present):',
        notes: ['Element (3) is present when no rude/dismissive language appears; absence of bad behavior satisfies it.'],
    },
);

const ACTIVE_LISTENING_RUBRIC = buildChecklistRubric(
    'Active listening and confirmation.',
    [
        'asks clarifying questions or restates the customer request in own words',
        'confirms understanding before acting ("правильно ли я понял", "то есть вам нужно …", "let me make sure I understand")',
        'operator responses address what the customer actually said (not a generic script ignoring input)',
        'does not repeatedly ignore, talk over, or skip answering direct customer questions',
    ],
    { scope: 'Required elements across the call (count how many are clearly present):' },
);

const OBJECTION_HANDLING_RUBRIC = buildChecklistRubric(
    'Objection and complaint handling.',
    [
        'acknowledges the objection, complaint, or pushback (does not ignore it)',
        'responds with explanation, alternative, or next step (not silence or deflection only)',
        'stays calm and professional while handling the objection',
        'attempts to move toward resolution or agreement after the objection',
    ],
    {
        scope: 'Required elements when a customer objection or complaint occurs (count how many are clearly present):',
        notes: ['If the customer raised no objection or complaint in this call, assign 100 — all elements are N/A.'],
    },
);

const PRODUCT_KNOWLEDGE_RUBRIC = buildChecklistRubric(
    'Product, service, and process knowledge.',
    [
        'answers customer questions with specific, relevant information (not vague evasion)',
        'information given appears consistent and plausible (no obvious contradictions or clear factual errors)',
        'explains options, steps, pricing, or procedures when the customer asks or when required to proceed',
        'when uncertain, admits limits and offers lookup/escalation instead of guessing — that satisfies this element',
    ],
    { scope: 'Required elements across the call (count how many are clearly present):' },
);

const PROBLEM_RESOLUTION_RUBRIC = buildChecklistRubric(
    'Problem resolution / first-contact resolution.',
    [
        'identifies the customer\'s problem or request clearly',
        'takes a concrete action (system lookup, fix, ticket, instructions, callback arrangement)',
        'confirms the outcome or next step with the customer before closing',
        'customer\'s issue is resolved in-call OR a clear, actionable next step is agreed (both satisfy this element)',
    ],
    { scope: 'Required elements across the call (count how many are clearly present):' },
);

const SPEECH_CLARITY_PACE_RUBRIC = buildChecklistRubric(
    'Speech clarity and pace (as observable from the transcript).',
    [
        'operator turns are coherent and understandable (not fragmented beyond recognition noise)',
        'no excessive filler or repetition that makes key points hard to follow',
        'responses are appropriately sized — not consistently one-word dismissals nor unbroken monologues that block the customer',
        'important details (numbers, dates, names, amounts) are stated clearly enough to be captured in the transcript',
    ],
    {
        scope: 'Required elements in operator speech (count how many are clearly present):',
        notes: ['Judge from transcript text only; do not penalize for accent or STT artifacts unless speech is truly incoherent.'],
    },
);

const CLOSING_QUALITY_RUBRIC = buildChecklistRubric(
    'Call closing and next steps.',
    [
        'summarizes what was done or the agreed next steps',
        'asks if anything else is needed ("есть ли ещё вопросы", "могу ли я ещё чем-то помочь", "anything else I can help with")',
        'thanks the customer',
        'polite farewell ("до свидания", "хорошего дня", "have a nice day", etc.)',
    ],
    { scope: 'Required elements in the operator closing (count how many are clearly present):' },
);

/**
 * Versioned identifier of the analysis prompt + rubric artifact.
 * Bump this whenever the prompt text, rubric anchors, or output schema change so
 * that historical analyses remain comparable and offline evals can be tied to a
 * specific prompt revision. Stored on each record (DB column + metrics._model).
 * Format: YYYY-MM-DD.N (date of change + same-day revision counter).
 */
export const PROMPT_VERSION = '2026-06-18.3';

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

    let customMetricsPromptBlock = '';
    if (ctx.customMetrics.length) {
        const customDefs = ctx.customMetrics.map(m => {
            let typeDef = `<${m.type}>`;
            if (m.type === 'enum' && m.enumValues?.length) {
                typeDef = `one of: ${m.enumValues.join(', ')}`;
            } else if (m.type === 'number') {
                const { min, max } = resolveMetricRange(m);
                typeDef = `<number ${min}..${max}>`;
            }
            return `  "${m.id}": ${typeDef} — ${m.description}`;
        }).join('\n');
        customMetricsPromptBlock = `

Additionally, analyze these CUSTOM metrics in "custom_metrics" and provide an assessment for each in "assessments":
{
${customDefs}
}`;
    }

    const businessContext = options?.systemPrompt
        ? `\nBUSINESS CONTEXT: ${options.systemPrompt}\n`
        : '';

    const qualityHintBlock = options?.qualityHintConfidence != null
        ? `\nQUALITY NOTE: Speech recognition confidence is low (${options.qualityHintConfidence}). If the dialogue is too short or incoherent to score reliably, set insufficient_content=true and analysis_confidence below 0.4. Do not invent numeric scores from noise.\n`
        : '';

    const metricJsonLines = ctx.visibleDefaultMetrics
        .map(key => `  "${key}": <0|25|50|75|100>`)
        .join(',\n');

    const assessmentJsonLines = [
        ...ctx.visibleDefaultMetrics.map(key => `    "${key}": { "rationale": "<why this score, in the conversation language>", "quote": "<short supporting quote or empty>" }`),
        ...ctx.customMetrics.map(m => `    "${m.id}": { "rationale": "<why this value, in the conversation language>", "quote": "<short supporting quote or empty>" }`),
        `    "csat": { "rationale": "<why this CSAT 1-5, in the conversation language>", "quote": "<short supporting quote or empty>" }`,
        `    "customer_sentiment": { "rationale": "<why this sentiment, in the conversation language>", "quote": "<short supporting quote or empty>" }`,
        `    "success": { "rationale": "<why the issue was/was not resolved, in the conversation language>", "quote": "<short supporting quote or empty>" }`,
    ].join(',\n');

    return `
You are a senior call center quality assurance analyst. Analyze the following transcription of a call between a LIVE HUMAN OPERATOR and a customer. Generate a JSON report with metrics.
${businessContext}${qualityHintBlock}
TRANSCRIPTION:
${transcription}

SCORING METHOD (follow this order strictly):
1. FIRST fill "assessments": for each metric, write a short "rationale" BEFORE deciding the number. The rationale must (a) name the rubric level it matches, (b) describe the specific observable operator behavior that justifies it (paraphrase it, do NOT copy a verbatim quote into the rationale), and (c) for any score below 100, state which required rubric element is absent or how the operator could improve (coaching-oriented). Keep it to 1-2 sentences in the conversation language. Put the supporting verbatim snippet ONLY in the separate "quote" field (or "" if none applies); never repeat that snippet inside "rationale".
2. THEN assign each numeric score so it is consistent with its rationale.
${FULL_SCORE_INSTRUCTION}
Do not reward verbosity. Judge observable behavior, not tone alone.

Return a JSON object with EXACTLY this structure:

{
  "assessments": {
${assessmentJsonLines}
  },
${metricJsonLines}${metricJsonLines ? ',' : ''}
  "customer_sentiment": "<Positive|Neutral|Negative>",
  "csat": <1-5 integer>,
  "summary": "<string>",
  "success": <boolean>,
  "analysis_confidence": <0-1 number>,
  "insufficient_content": <boolean>,
  "diarized_text": [
    { "speaker": "operator", "text": "..." },
    { "speaker": "customer", "text": "..." }
  ]${ctx.customMetrics.length ? ',\n  "custom_metrics": { ... }' : ''}
}

Metric descriptions:
${metricLines}
- customer_sentiment: Overall customer sentiment at the end of the call (English enum only).
- csat: Customer Satisfaction Score from 1 to 5.
- summary: Brief summary in the conversation language.
- success: Was the customer's question or problem resolved?
- analysis_confidence: Confidence (0..1) that the transcript supports reliable scoring.
- insufficient_content: true if transcript is too short or incoherent for reliable scores.
- assessments: For EACH scored metric above AND for csat, customer_sentiment and success, provide { rationale, quote } as described in the SCORING METHOD.
${customMetricsPromptBlock}

diarized_text rules:
- "speaker" must be "operator" or "customer" (lowercase English).
- Preserve ALL original text; do not omit, summarize, or translate.

Return ONLY valid JSON without markdown formatting.
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
