import { ALL_DEFAULT_METRIC_KEYS, DefaultMetricKey } from '../interfaces/operator-metrics.interface';

/**
 * Pure (no I/O) statistics used by the offline analytics-quality eval.
 * Compares LLM predictions against an expert-labeled golden set:
 *  - MAE for numeric scores (0..100 metrics, csat 1..5),
 *  - accuracy (proportion of agreement) for booleans/enums,
 *  - Cohen's kappa for categorical agreement corrected for chance.
 */

export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative';

export interface GoldenReference {
    greeting_quality?: number;
    script_compliance?: number;
    politeness_empathy?: number;
    active_listening?: number;
    objection_handling?: number;
    product_knowledge?: number;
    problem_resolution?: number;
    speech_clarity_pace?: number;
    closing_quality?: number;
    csat?: number;
    customer_sentiment?: SentimentLabel;
    success?: boolean;
    custom_metrics?: Record<string, number | boolean | string>;
}

export interface PredictedValues {
    greeting_quality?: number;
    script_compliance?: number;
    politeness_empathy?: number;
    active_listening?: number;
    objection_handling?: number;
    product_knowledge?: number;
    problem_resolution?: number;
    speech_clarity_pace?: number;
    closing_quality?: number;
    csat?: number;
    customer_sentiment?: string;
    success?: boolean;
    custom_metrics?: Record<string, number | boolean | string | null> | null;
}

export interface EvalItem {
    id: string;
    reference: GoldenReference;
    predicted: PredictedValues;
}

export interface NumericMetricReport {
    metric: string;
    mae: number;
    n: number;
}

export interface CategoricalMetricReport {
    metric: string;
    accuracy: number;
    kappa: number | null;
    n: number;
}

export interface EvalReport {
    casesEvaluated: number;
    numeric: NumericMetricReport[];
    categorical: CategoricalMetricReport[];
    /** Macro-average MAE across all numeric metrics (lower is better). */
    overallMae: number | null;
    /** Macro-average accuracy across all categorical metrics (higher is better). */
    overallAccuracy: number | null;
}

/** Mean Absolute Error over [predicted, reference] pairs. Returns null if no pairs. */
export function meanAbsoluteError(pairs: Array<[number, number]>): number | null {
    if (!pairs.length) return null;
    const sum = pairs.reduce((acc, [p, r]) => acc + Math.abs(p - r), 0);
    return round(sum / pairs.length);
}

/** Proportion of exact agreement over [predicted, reference] pairs. Null if empty. */
export function proportionAgreement<T>(pairs: Array<[T, T]>): number | null {
    if (!pairs.length) return null;
    const agree = pairs.reduce((acc, [p, r]) => acc + (p === r ? 1 : 0), 0);
    return round(agree / pairs.length);
}

/**
 * Cohen's kappa for two categorical raters (predicted vs reference).
 * Returns null when undefined (no data, or a single category with full agreement
 * where chance agreement is 1 → division by zero).
 */
export function cohensKappa(predicted: string[], reference: string[]): number | null {
    if (predicted.length !== reference.length || predicted.length === 0) return null;

    const n = predicted.length;
    const categories = Array.from(new Set([...predicted, ...reference]));

    let observedAgree = 0;
    for (let i = 0; i < n; i++) {
        if (predicted[i] === reference[i]) observedAgree++;
    }
    const po = observedAgree / n;

    let pe = 0;
    for (const c of categories) {
        const pPred = predicted.filter(x => x === c).length / n;
        const pRef = reference.filter(x => x === c).length / n;
        pe += pPred * pRef;
    }

    if (pe === 1) return null;
    return round((po - pe) / (1 - pe));
}

const NUMERIC_KEYS: Array<DefaultMetricKey | 'csat'> = [...ALL_DEFAULT_METRIC_KEYS, 'csat'];

/** Build the full eval report from labeled items. */
export function buildEvalReport(items: EvalItem[]): EvalReport {
    const numeric: NumericMetricReport[] = [];
    for (const key of NUMERIC_KEYS) {
        const pairs: Array<[number, number]> = [];
        for (const item of items) {
            const ref = (item.reference as any)[key];
            const pred = (item.predicted as any)[key];
            if (typeof ref === 'number' && typeof pred === 'number') {
                pairs.push([pred, ref]);
            }
        }
        const mae = meanAbsoluteError(pairs);
        if (mae != null) numeric.push({ metric: key, mae, n: pairs.length });
    }

    const categorical: CategoricalMetricReport[] = [];

    const sentimentPairs: Array<[string, string]> = [];
    for (const item of items) {
        const ref = item.reference.customer_sentiment;
        const pred = item.predicted.customer_sentiment;
        if (typeof ref === 'string' && typeof pred === 'string') {
            sentimentPairs.push([pred, ref]);
        }
    }
    if (sentimentPairs.length) {
        categorical.push({
            metric: 'customer_sentiment',
            accuracy: proportionAgreement(sentimentPairs)!,
            kappa: cohensKappa(sentimentPairs.map(p => p[0]), sentimentPairs.map(p => p[1])),
            n: sentimentPairs.length,
        });
    }

    const successPairs: Array<[string, string]> = [];
    for (const item of items) {
        const ref = item.reference.success;
        const pred = item.predicted.success;
        if (typeof ref === 'boolean' && typeof pred === 'boolean') {
            successPairs.push([String(pred), String(ref)]);
        }
    }
    if (successPairs.length) {
        categorical.push({
            metric: 'success',
            accuracy: proportionAgreement(successPairs)!,
            kappa: cohensKappa(successPairs.map(p => p[0]), successPairs.map(p => p[1])),
            n: successPairs.length,
        });
    }

    const overallMae = numeric.length
        ? round(numeric.reduce((s, m) => s + m.mae, 0) / numeric.length)
        : null;
    const overallAccuracy = categorical.length
        ? round(categorical.reduce((s, m) => s + m.accuracy, 0) / categorical.length)
        : null;

    return {
        casesEvaluated: items.length,
        numeric,
        categorical,
        overallMae,
        overallAccuracy,
    };
}

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}
