const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrateCallType } = require('./migrate-call-type.cjs');

function fixture(existing, failure) {
    const added = [], sql = [];
    const query = {
        queryGenerator: { quoteTable: name => `"${name}"`, quoteIdentifier: name => `"${name}"` },
        describeTable: async () => existing ? { callType: {} } : {},
        addColumn: async (...args) => { if (failure) throw failure; added.push(args); },
    };
    return { database: { getQueryInterface: () => query, query: async s => sql.push(s) }, added, sql };
}
test('adds nullable columns without backfilling and sets incoming defaults', async () => {
    const f = fixture(false); await migrateCallType(f.database);
    assert.deepEqual(f.added.map(args => args[0]), ['operator_analytics', 'aiCdr']);
    assert.ok(f.added.every(args => args[2].allowNull && !('defaultValue' in args[2])));
    assert.equal(f.sql.length, 2);
    assert.ok(f.sql.every(s => s.endsWith("SET DEFAULT 'incoming'") && !s.includes('UPDATE ')));
});
test('repeat deployment does not add existing columns', async () => {
    const f = fixture(true); await migrateCallType(f.database); assert.equal(f.added.length, 0);
});
test('a migration failure stops deployment', async () => {
    const f = fixture(false, new Error('permission denied'));
    await assert.rejects(migrateCallType(f.database), /permission denied/); assert.equal(f.sql.length, 0);
});
test('handles a concurrent column addition', async () => {
    const f = fixture(false, { original: { code: '42701' } });
    await migrateCallType(f.database); assert.equal(f.sql.length, 2);
});

test('stdin deployment entrypoint actually runs the migration', () => {
    const { spawnSync } = require('node:child_process');
    const { readFileSync } = require('node:fs');
    const result = spawnSync(process.execPath, [], {
        input: readFileSync(require.resolve('./migrate-call-type.cjs')),
        cwd: __dirname,
        env: { ...process.env, DB_HOST: '' },
        encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /callType migration failed/);
});
