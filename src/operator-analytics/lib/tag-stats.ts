import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import type { TagDefinition, TagStat } from '../interfaces/operator-metrics.interface';
import { ALL_DEFAULT_METRIC_KEYS } from '../interfaces/operator-metrics.interface';
import { averageOperatorScore, type OperatorScoreOptions } from './operator-evidence';

export const TAG_STATS_MAX_ENTRIES = 50;

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

export function buildTagStats(
    records: AiCdr[],
    taxonomy: TagDefinition[],
    scoreOptions: OperatorScoreOptions = { defaultKeys: ALL_DEFAULT_METRIC_KEYS },
): TagStat[] {
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

    const periodAverageScore = records.some(r => r.analytics?.metrics)
        ? averageOperatorScore(records, scoreOptions)
        : null;
    const periodTotal = records.length || 1;

    const stats: TagStat[] = Array.from(byTag.entries()).map(([tagId, rows]) => {
        let successCount = 0;
        let positiveCount = 0;
        let neutralCount = 0;
        let negativeCount = 0;
        let scored = 0;

        for (const r of rows) {
            const m = r.analytics?.metrics as Record<string, unknown> | undefined;
            if (!m) continue;
            scored++;
            if (m.success) successCount++;
            const sentiment = (r.analytics?.sentiment || m.customer_sentiment || '').toString().toLowerCase();
            if (sentiment === 'positive') positiveCount++;
            else if (sentiment === 'neutral') neutralCount++;
            else if (sentiment === 'negative') negativeCount++;
        }

        const denom = scored || 1;
        const averageScore = averageOperatorScore(rows, scoreOptions);

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
