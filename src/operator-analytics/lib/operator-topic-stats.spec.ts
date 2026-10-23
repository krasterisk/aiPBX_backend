import { Sequelize } from 'sequelize';
import type { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { buildOperatorTopicStats, normalizeOperatorName, operatorCallCondition, topicCallCondition } from './operator-topic-stats';

const taxonomy = [{ id: 'billing', name: 'Billing', aliases: [] }, { id: 'returns', name: 'Returns', aliases: [] }];
const record = (name: string | null, tags?: unknown[], quality?: string): AiCdr => ({
    assistantName: name,
    analytics: tags === undefined ? undefined : { metrics: { _topics: { tags }, _quality: { quality } } },
} as unknown as AiCdr);

describe('operator topic counts', () => {
    it('merges workplaces by employee ID and separates employees with the same name', () => {
        const calls = [
            { ...record('Anna', ['billing']), userId: '99', operatorId: 'pbx:7', operatorExtension: '301' },
            { ...record('Anna', ['billing']), userId: '99', operatorId: 'pbx:7', operatorExtension: '302' },
            { ...record('Anna', ['returns']), userId: '99', operatorId: 'pbx:8', operatorExtension: '301' },
        ] as AiCdr[];
        const result = buildOperatorTopicStats(calls, taxonomy);
        expect(result.totalCalls).toBe(3);
        expect(result.operators).toHaveLength(2);
        expect(result.operators.find(row => row.operatorId === 'pbx:7')).toMatchObject({ callsCount: 2, topics: [{ tagId: 'billing', callsCount: 2 }] });
        expect(result.operators.find(row => row.operatorId === 'pbx:8')?.callsCount).toBe(1);
    });
    it('counts every record, deduplicates topics within calls, and keeps unique totals', () => {
        const result = buildOperatorTopicStats([
            record(' Alice ', ['billing', 'billing', 'returns']),
            record('Alice', ['billing'], 'low'),
            record('Bob', [], 'unusable'),
            record(null),
            record('Unknown Operator', ['returns']),
            record('   ', []),
        ], taxonomy);
        expect(result.totalCalls).toBe(6);
        expect(result.hasMultipleTopics).toBe(true);
        expect(result.topics).toEqual([
            { tagId: 'billing', name: 'Billing', callsCount: 2 },
            { tagId: 'returns', name: 'Returns', callsCount: 2 },
            { tagId: null, name: '', callsCount: 3 },
        ]);
        expect(result.operators.find(row => row.operatorName === 'Alice')).toEqual({
            operatorName: 'Alice', callsCount: 2,
            topics: [{ tagId: 'billing', callsCount: 2 }, { tagId: 'returns', callsCount: 1 }],
        });
        expect(result.operators.find(row => row.operatorName === null)?.callsCount).toBe(3);
        expect(result.operators.reduce((sum, row) => sum + row.callsCount, 0)).toBe(6);
    });

    it('retains configured zero topics and historic topic names', () => {
        const historic = record('Bob', ['old']);
        const topics = historic.analytics!.metrics._topics as { tag_names?: Record<string, string> };
        topics.tag_names = { old: 'Historic name' };
        const result = buildOperatorTopicStats([historic], taxonomy);
        expect(result.topics.find(topic => topic.tagId === 'billing')?.callsCount).toBe(0);
        expect(result.topics.find(topic => topic.tagId === 'old')).toEqual({ tagId: 'old', name: 'Historic name', callsCount: 1 });
        expect(result.hasMultipleTopics).toBe(false);
    });

    it('handles empty periods and does not confuse missing operators with named ones', () => {
        expect(buildOperatorTopicStats([], taxonomy).operators).toEqual([]);
        expect(normalizeOperatorName(' Alice ')).toBe('Alice');
        expect(normalizeOperatorName('Unknown Operator')).toBeNull();
        expect(normalizeOperatorName('Без оператора')).toBe('Без оператора');
    });
});

describe.each(['postgres', 'mysql'] as const)('topic call SQL (%s)', dialect => {
    const sequelize = new Sequelize('db', 'user', 'password', { dialect, logging: false });
    const generator = sequelize.getQueryInterface() as unknown as {
        queryGenerator: { whereItemsQuery: (condition: ReturnType<typeof topicCallCondition>) => string };
    };
    const sql = (condition: ReturnType<typeof topicCallCondition>) => generator.queryGenerator.whereItemsQuery(condition);

    it('uses exact JSON membership and safely quotes a topic containing a quote', () => {
        const query = sql(topicCallCondition(dialect, "billing' OR 1=1 --"));
        expect(query).toContain(dialect === 'postgres' ? 'jsonb_exists' : 'JSON_CONTAINS');
        expect(query).toContain(dialect === 'postgres' ? "billing'' OR" : "billing\\' OR");
        expect(query).not.toContain('5000');
    });

    it('matches empty or missing arrays, including calls without analytics', () => {
        const query = sql(topicCallCondition(dialect, undefined, true));
        expect(query).toContain(dialect === 'postgres' ? 'jsonb_array_length' : 'JSON_LENGTH');
        expect(query).toContain('CASE WHEN');
        expect(query).toContain('= 0');
    });

    it('uses case-sensitive names and groups null/blank/unknown operators consistently', () => {
        const query = sql(operatorCallCondition(dialect, ' Alice '));
        expect(query).toContain("= 'Alice'");
        expect(query).not.toContain('LIKE');
        if (dialect === 'mysql') expect(query).toContain('AS BINARY');
        const missing = sql(operatorCallCondition(dialect, undefined, true));
        expect(missing).toContain('COALESCE');
        expect(missing).toContain("IN ('', 'Unknown Operator')");
    });
});
