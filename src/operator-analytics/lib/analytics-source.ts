/**
 * Single source of truth for CDR `source` values produced by operator analytics.
 * Mirrored on the frontend in `entities/Report/lib/isOperatorAnalyticsSource.ts`.
 */
export const OPERATOR_CDR_SOURCE = {
    /** Analyzed via external API token. */
    EXTERNAL_API: 'external-api',
    /** Analyzed via the in-app frontend uploader. */
    EXTERNAL_FRONT: 'external-front',
} as const;

export type OperatorCdrSource = typeof OPERATOR_CDR_SOURCE[keyof typeof OPERATOR_CDR_SOURCE];

export const OPERATOR_CDR_SOURCES: readonly string[] = Object.values(OPERATOR_CDR_SOURCE);

/** True when a CDR originates from the operator-analytics pipeline. */
export function isOperatorAnalyticsSource(source?: string | null): boolean {
    return source === OPERATOR_CDR_SOURCE.EXTERNAL_API || source === OPERATOR_CDR_SOURCE.EXTERNAL_FRONT;
}
