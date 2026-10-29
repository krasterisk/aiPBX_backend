import type { Sequelize } from 'sequelize';
import { appliedQualityScorecard, loadQualityReadProjections, qualityReadOrder, qualityReadRelation } from './quality-read-projection';
import { currentQualityProjection } from './current-quality-projection';
import { calculateQualityScore, createQualityScorecard } from './quality-score';

it('resolves unopened historical scores without writes, retaining frozen scales, overrides and null semantics', async () => {
    const metrics = { greeting_quality: 100, custom_metrics: { check: true, zero: 0, none: null },
        _custom_meta: { check: { type: 'boolean' }, zero: { type: 'number', min: 0, max: 10 }, none: { type: 'boolean' } } };
    const card = createQualityScorecard({ id: 5 }, '99', { legacy: true, metrics });
    card.criteria.filter(rule => rule.origin === 'custom').forEach(rule => { rule.included = false; });
    const original = JSON.stringify(card);
    const overrides = [{ metricId: 'check', origin: 'custom', boolValue: false }];
    const query = jest.fn().mockResolvedValueOnce([{ id: 'old', userId: '99' }]).mockResolvedValueOnce([
        { id: 'old', userId: '99', snapshot: card, metrics, overrides },
    ]).mockResolvedValue([{ id: 'old', userId: '99' }]);
    const db = { query, getDialect: () => 'postgres', escape: (value: string) => `'${value.replace(/'/g, "''")}'` } as unknown as Sequelize;
    const resolved = await loadQualityReadProjections(db, { userId: '99', projectId: 5 });
    const expected = calculateQualityScore(appliedQualityScorecard(card), metrics, overrides);
    expect(expected.score).toBeCloseTo(100 / 3);
    expect(resolved.old).toMatchObject({ qualityScore: expected.score, qualityStatus: 'scored' });
    expect(currentQualityProjection({ qualityRunId: 'old', qualityVersion: 'quality-v2.1', qualityScore: 100 }, resolved).qualityScore).toBe(expected.score);
    expect(qualityReadRelation(db, resolved)).toContain('jsonb_populate_record');
    expect(qualityReadOrder(db, resolved, 'analytics')).toContain('double precision');
    expect(JSON.stringify(card)).toBe(original);
    expect(query.mock.calls[0][1].replacements).toMatchObject({ owner: '99', project: 5 });
    await loadQualityReadProjections(db, { userId: '99', projectId: 5 });
    expect(query).toHaveBeenCalledTimes(3); // Second read only checks immutable run IDs.
    expect(query.mock.calls.every(([sql]) => !/\b(UPDATE|INSERT|DELETE)\b/.test(sql))).toBe(true);
});

it('does not reuse a run across owners or publish a missing snapshot as an old score', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'run', userId: '99' }]).mockResolvedValueOnce([
        { id: 'run', userId: '100' },
    ]);
    await expect(loadQualityReadProjections({ query, getDialect: () => 'postgres' } as unknown as Sequelize, { userId: '99' }))
        .rejects.toThrow('Quality read scope mismatch');
    expect(currentQualityProjection({ qualityRunId: 'missing', qualityScore: 100 }, {}).qualityScore).toBeNull();
});
