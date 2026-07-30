import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import type { TagDefinition, TagStat } from '../interfaces/operator-metrics.interface';

export const TAG_STATS_MAX_ENTRIES = 50;

const NUMERIC_KEYS = [
    'greeting_quality', 'script_compliance', 'politeness_empathy',
    'active_listening', 'objection_handling', 'product_knowledge',
    'problem_resolution', 'speech_clarity_pace', 'closing_quality',
] as const;

function readCallTags(metrics: Record<string, unknown> | undefined): {
    tagIds: string[];
    tagNames: Record<string, string>;
} {
    const topics = metrics?._topics as { tags?: string[]; tag_names?: Record<string, string> } | undefined;
    return {
        tagIds: topics?.tags ?? [],
        tagNames: topics?.tag_names ?? {},
    };
}

function resolveTagName(
    tagId: string,
    taxonomy: TagDefinition[],
    snapshotNames: Map<string, string>,
): string {
    const fromTaxonomy = taxonomy.find(t => t.id === tagId)?.name;
    if (fromTaxonomy) return fromTaxonomy;
    const fromSnapshot = snapshotNames.get(tagId);
    if (fromSnapshot) return fromSnapshot;
    return tagId;
}

function computePeriodAverageScore(records: AiCdr[]): number | null {
    const sums: Record<string, number> = {};
    NUMERIC_KEYS.forEach(k => { sums[k] = 0; });
    let scored = 0;

    for (const r of records) {
        const m = r.analytics?.metrics as Record<string, unknown> | undefined;
        if (!m) continue;
        scored++;
        NUMERIC_KEYS.forEach(k => { sums[k] += (Number(m[k]) || 0); });
    }

    if (scored === 0) return null;
    const denom = scored;
    return parseFloat(
        (NUMERIC_KEYS.reduce((s, k) => s + sums[k] / denom, 0) / NUMERIC_KEYS.length).toFixed(2),
    );
}

export function buildTagStats(records: AiCdr[], taxonomy: TagDefinition[]): TagStat[] {
    const byTag = new Map<string, AiCdr[]>();
    const snapshotNames = new Map<string, string>();

    for (const record of records) {
        const metrics = record.analytics?.metrics as Record<string, unknown> | undefined;
        const { tagIds, tagNames } = readCallTags(metrics);
        for (const [id, name] of Object.entries(tagNames)) {
            if (!snapshotNames.has(id)) snapshotNames.set(id, name);
        }
        for (const tagId of tagIds) {
            if (!byTag.has(tagId)) byTag.set(tagId, []);
            byTag.get(tagId)!.push(record);
        }
    }

    const periodAverageScore = computePeriodAverageScore(records);
    const periodTotal = records.length || 1;

    const stats: TagStat[] = Array.from(byTag.entries()).map(([tagId, rows]) => {
        const sums: Record<string, number> = {};
        NUMERIC_KEYS.forEach(k => { sums[k] = 0; });
        let successCount = 0;
        let positiveCount = 0;
        let neutralCount = 0;
        let negativeCount = 0;
        let scored = 0;

        for (const r of rows) {
            const m = r.analytics?.metrics as Record<string, unknown> | undefined;
            if (!m) continue;
            scored++;
            NUMERIC_KEYS.forEach(k => { sums[k] += (Number(m[k]) || 0); });
            if (m.success) successCount++;
            const sentiment = (r.analytics?.sentiment || m.customer_sentiment || '').toString().toLowerCase();
            if (sentiment === 'positive') positiveCount++;
            else if (sentiment === 'neutral') neutralCount++;
            else if (sentiment === 'negative') negativeCount++;
        }

        const denom = scored || 1;
        const averageScore = scored > 0
            ? parseFloat(
                (NUMERIC_KEYS.reduce((s, k) => s + sums[k] / denom, 0) / NUMERIC_KEYS.length).toFixed(2),
            )
            : 0;

        const stat: TagStat = {
            tagId,
            name: resolveTagName(tagId, taxonomy, snapshotNames),
            callsCount: rows.length,
            averageScore,
            successRate: parseFloat(((successCount / denom) * 100).toFixed(2)),
            sentiment: {
                positive: positiveCount,
                neutral: neutralCount,
                negative: negativeCount,
            },
            shareOfPeriodCalls: parseFloat(((rows.length / periodTotal) * 100).toFixed(2)),
        };

        if (periodAverageScore != null) {
            stat.deltaVsPeriodAverage = parseFloat((averageScore - periodAverageScore).toFixed(2));
        }

        return stat;
    });

    stats.sort((a, b) => {
        if (b.callsCount !== a.callsCount) return b.callsCount - a.callsCount;
        return a.name.localeCompare(b.name, 'ru');
    });

    return stats.slice(0, TAG_STATS_MAX_ENTRIES);
}
