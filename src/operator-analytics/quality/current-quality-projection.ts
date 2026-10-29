import { QUALITY_FORMULA_VERSION } from './quality-score';
import type { QualityReadProjections } from './quality-read-projection';

/** Never present a previous formula's stored score as a current published result. No writes on list reads. */
export function currentQualityProjection<T extends { qualityRunId?: string | null; qualityVersion?: string | null; qualityScore?: number | null; qualityStatus?: string | null }>(analytics: T, resolved: QualityReadProjections = {}): T {
    if (!analytics || analytics.qualityVersion === QUALITY_FORMULA_VERSION) return analytics;
    if (analytics.qualityRunId && resolved[analytics.qualityRunId]) return { ...analytics, ...resolved[analytics.qualityRunId] };
    return { ...analytics, qualityScore: null, qualityStatus: 'needs_review' };
}
