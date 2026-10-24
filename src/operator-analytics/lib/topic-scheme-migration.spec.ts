const { migrateTopicScheme } = require('../../../scripts/migrate-topic-scheme.cjs');

describe('topic scheme deployment migration', () => {
    function database(dialect = 'postgres', existing = false) {
        const query = { describeTable: jest.fn(async () => existing ? { topicSchemeState: {} } : {}),
            addColumn: jest.fn(async () => undefined) };
        return { getQueryInterface: () => query, getDialect: () => dialect, query };
    }

    it.each(['postgres', 'mysql'])('adds a nullable JSON column for %s without updating project rows', async dialect => {
        const db = database(dialect);
        await migrateTopicScheme(db);
        expect(db.query.addColumn).toHaveBeenCalledWith('operator_projects', 'topicSchemeState',
            expect.objectContaining({ allowNull: true }));
    });
    it('is idempotent and only tolerates duplicate-column races', async () => {
        const existing = database('postgres', true);
        await migrateTopicScheme(existing);
        expect(existing.query.addColumn).not.toHaveBeenCalled();
        const racing = database();
        racing.query.addColumn.mockRejectedValueOnce({ original: { code: '42701' } });
        await expect(migrateTopicScheme(racing)).resolves.toBeUndefined();
        racing.query.addColumn.mockRejectedValueOnce(new Error('permission denied'));
        await expect(migrateTopicScheme(racing)).rejects.toThrow('permission denied');
    });
});
