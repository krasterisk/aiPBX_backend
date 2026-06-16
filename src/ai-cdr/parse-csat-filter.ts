import { Op } from 'sequelize'

export function parseCsatFilter(csat?: string): { scores: number[]; includeNone: boolean } {
    if (!csat?.trim()) {
        return { scores: [], includeNone: false }
    }

    const parts = csat.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean)

    return {
        includeNone: parts.includes('none'),
        scores: parts
            .filter((part) => part !== 'none')
            .map(Number)
            .filter((score) => Number.isInteger(score) && score >= 1 && score <= 5),
    }
}

export function buildCsatWhereCondition(
    scores: number[],
    includeNone: boolean,
): Record<string, unknown> | null {
    if (!scores.length && !includeNone) {
        return null
    }

    const parts: Record<string, unknown>[] = []

    if (scores.length) {
        parts.push({ '$analytics.csat$': { [Op.in]: scores } })
    }

    if (includeNone) {
        parts.push({ '$analytics.csat$': null })
    }

    if (parts.length === 1) {
        return parts[0]
    }

    return { [Op.or]: parts }
}
