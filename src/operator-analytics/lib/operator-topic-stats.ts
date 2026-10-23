import { operatorIdentityKey } from './operator-identity';
import { Op, Sequelize } from 'sequelize';
import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import type { OperatorTopicStats, TagDefinition } from '../interfaces/operator-metrics.interface';
import { postgresJsonbCast } from './dashboard-aggregation';

export function normalizeOperatorName(name?: string | null): string | null {
    const value = name?.trim();
    return !value || value === 'Unknown Operator' ? null : value;
}

/** MySQL's default collations are case-insensitive; match the matrix's exact names. */
export function operatorCallCondition(dialect: string, name?: string, withoutOperator = false) {
    const normalized = Sequelize.fn('TRIM', Sequelize.fn('COALESCE', Sequelize.col('assistantName'), ''));
    const expression = dialect === 'postgres' ? normalized : Sequelize.cast(normalized, 'BINARY');
    return Sequelize.where(expression, withoutOperator ? { [Op.in]: ['', 'Unknown Operator'] } : name?.trim());
}

export function readTopicIds(metrics?: Record<string, unknown>): string[] {
    const topics = metrics?._topics as { tags?: unknown } | undefined;
    const tags = topics?.tags;
    return Array.isArray(tags)
        ? [...new Set(tags.filter((id): id is string => typeof id === 'string' && id.length > 0))]
        : [];
}

/** Counts use every available CDR; quality filtering is exclusively for scores. */
export function buildOperatorTopicStats(records: AiCdr[], taxonomy: TagDefinition[]): OperatorTopicStats {
    const topics = new Map<string | null, { tagId: string | null; name: string; callsCount: number }>();
    for (const tag of taxonomy) topics.set(tag.id, { tagId: tag.id, name: tag.name, callsCount: 0 });
    topics.set(null, { tagId: null, name: '', callsCount: 0 });
    const operators = new Map<string | null, OperatorTopicStats['operators'][number]>();
    const latestNames = new Map<string, number>();
    let hasMultipleTopics = false;

    for (const record of records) {
        const operatorName = normalizeOperatorName(record.assistantName);
        const key = operatorIdentityKey(record);
        let operator = operators.get(key);
        if (!operator) {
            operator = { ...(record.operatorId ? { operatorId: record.operatorId, ...(record.userId ? { operatorAccountId: record.userId } : {}) } : {}), operatorName, callsCount: 0, topics: [] };
            operators.set(key, operator);
        }
        const timestamp = new Date(record.createdAt ?? 0).getTime();
        if (record.operatorId && timestamp >= (latestNames.get(key) ?? -1)) {
            operator.operatorName = operatorName;
            latestNames.set(key, timestamp);
        }
        operator.callsCount++;
        const ids = readTopicIds(record.analytics?.metrics);
        if (ids.length > 1) hasMultipleTopics = true;
        for (const tagId of ids.length ? ids : [null]) {
            if (!topics.has(tagId)) {
                topics.set(tagId, {
                    tagId,
                    name: record.analytics?.metrics?._topics?.tag_names?.[tagId] || tagId,
                    callsCount: 0,
                });
            }
            topics.get(tagId)!.callsCount++;
            let cell = operator.topics.find(t => t.tagId === tagId);
            if (!cell) {
                cell = { tagId, callsCount: 0 };
                operator.topics.push(cell);
            }
            cell.callsCount++;
        }
    }
    return {
        totalCalls: records.length,
        hasMultipleTopics,
        topics: [...topics.values()],
        operators: [...operators.values()].sort((a, b) => b.callsCount - a.callsCount),
    };
}

/** JSON is the same read source used by the matrix, including legacy CDRs without tag rows. */
export function topicCallCondition(dialect: string, tagId?: string, withoutTopic = false) {
    const metrics = dialect === 'postgres' ? '"analytics"."metrics"' : '`analytics`.`metrics`';
    const tags = dialect === 'postgres'
        ? `CASE WHEN jsonb_typeof(${postgresJsonbCast(metrics)}->'_topics'->'tags') = 'array' THEN ${postgresJsonbCast(metrics)}->'_topics'->'tags' ELSE '[]'::jsonb END`
        : `CASE WHEN JSON_TYPE(JSON_EXTRACT(${metrics}, '$._topics.tags')) = 'ARRAY' THEN JSON_EXTRACT(${metrics}, '$._topics.tags') ELSE JSON_ARRAY() END`;
    if (withoutTopic) {
        return Sequelize.where(Sequelize.fn(dialect === 'postgres' ? 'jsonb_array_length' : 'JSON_LENGTH', Sequelize.literal(tags)), 0);
    }
    return Sequelize.where(
        dialect === 'postgres'
            ? Sequelize.fn('jsonb_exists', Sequelize.literal(tags), tagId)
            : Sequelize.fn('JSON_CONTAINS', Sequelize.literal(tags), JSON.stringify(tagId)),
        dialect === 'postgres' ? true : 1,
    );
}
