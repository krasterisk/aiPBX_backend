import { compileTopicEdit, topicHash } from './analytics-topics';

describe('scoped topic partial-edit compiler', () => {
    const topics = [{ id: 'booking', name: 'Booking', aliases: [], future: { preserved: true } }];
    const edit = () => ({ expected_hash: topicHash(topics), mode: 'create' as const, topic_id: 'delivery',
        changes: { name: 'Delivery', description: 'Questions about delivery', aliases: ['Where is my order?'] } });
    it('preserves opaque existing state and never mutates input', () => {
        const result = compileTopicEdit(topics, edit());
        expect(result[0]).toEqual(topics[0]);
        expect(result).toHaveLength(2);
        result[0].future.preserved = false;
        expect(topics[0].future.preserved).toBe(true);
    });
    it('updates only explicitly named fields', () => {
        expect(compileTopicEdit(topics, { ...edit(), mode: 'update', topic_id: 'booking', changes: { name: 'Appointments' } }))
            .toEqual([{ ...topics[0], name: 'Appointments' }]);
    });
    it('rejects stale state, extra scope, destructive modes and duplicates', () => {
        for (const patch of [{ expected_hash: '0'.repeat(64) }, { projectId: 5 }, { mode: 'delete' },
            { topic_id: 'booking' }, { changes: { name: 'BOOKING', description: 'x' } },
            { changes: { name: 'Delivery', description: 'x', aliases: ['a', ' A '] } }]) {
            expect(() => compileTopicEdit(topics, { ...edit(), ...patch } as any)).toThrow();
        }
    });
    it('hashes are independent of object key order', () => {
        expect(topicHash([{ id: 'x', name: 'Тема' }])).toEqual(topicHash([{ name: 'Тема', id: 'x' }]));
    });
    it('matches the Python snapshot hash for opaque numeric and Unicode keys', () => {
        const topics = [{id:'x',name:'Example',opaque:{'2':'two','10':'ten','😀':1,'�':2}}];
        expect(topicHash(topics)).toBe('ca368c2457139d3cf4104275781069f8b0a689fd80bdf39c2cbb97e726fc6401');
    });
});
