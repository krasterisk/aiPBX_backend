import { QUALITY_FORMULA_VERSION } from './quality-score';

/** Never present a previous formula's stored score as a current published result. No writes on list reads. */
export function currentQualityProjection<T extends { qualityVersion?: string | null; qualityScore?: number | null; qualityStatus?: string | null }>(analytics: T): T {
    if (!analytics || analytics.qualityVersion === QUALITY_FORMULA_VERSION) return analytics;
    return { ...analytics, qualityScore: null, qualityStatus: 'needs_review' };
}
