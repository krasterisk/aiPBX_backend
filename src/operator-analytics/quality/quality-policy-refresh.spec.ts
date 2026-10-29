import { QualityScoringService } from './quality-scoring.service';
import { createQualityScorecard, QUALITY_FORMULA_VERSION, QualityScoreResult } from './quality-score';

it('refreshes a stored score once while preserving answers, scales, corrections and prior history', async () => {
    const metrics = { greeting_quality: 100, custom_metrics: { check: true, na: null } };
    const snapshot = { ...createQualityScorecard({ id: 5 }, '99', { legacy: true, metrics: {
        ...metrics, _custom_meta: { check: { type: 'boolean' }, na: { type: 'boolean' } },
    } }), formulaVersion: 'quality-v2.1' };
    snapshot.criteria.filter(rule => rule.origin === 'custom').forEach(rule => { rule.included = false; });
    const raw = { metrics, input: { transcription: 'Synthetic frozen input' }, overrides: [
        { metricId: 'check', origin: 'custom', boolValue: false, actorUserId: '99' },
    ] };
    const previous = { id: 'old', projectId: 5, scorecardRevisionId: 'card', rawSnapshot: raw,
        kind: 'correction', result: { score: 100, formulaVersion: 'quality-v2.1' } };
    const update = jest.fn();
    const analytics = { qualityRunId: 'old', update };
    const projection = { findOne: jest.fn(async () => analytics), sequelize: {
        transaction: async (fn: (tx: { LOCK: { UPDATE: string } }) => Promise<void>) => fn({ LOCK: { UPDATE: 'UPDATE' } }),
    } };
    const runs = { findOne: jest.fn(async () => previous) };
    const service = Object.assign(Object.create(QualityScoringService.prototype) as Pick<QualityScoringService, 'refreshAppliedCriteria'>, {
        runs, cards: { findOne: async () => ({ snapshot }) }, analytics: projection,
        cdrs: { findOne: async () => ({ userId: '99' }) },
        saveRun: jest.fn(async (input: { result: QualityScoreResult }) => { previous.result = input.result; return { ...input, id: 'new' }; }),
        writeValueProjection: jest.fn(), projection: jest.fn(() => ({ qualityScore: 50 })),
    });
    await service.refreshAppliedCriteria('one', '99');
    const saved = service.saveRun.mock.calls[0][0];
    expect(saved).toMatchObject({ previousRunId: 'old', raw, result: { score: 50, coverage: 1, formulaVersion: QUALITY_FORMULA_VERSION } });
    expect(snapshot.formulaVersion).toBe('quality-v2.1');
    expect(snapshot.criteria[1].included).toBe(false);
    expect(raw.metrics.custom_metrics.check).toBe(true);
    expect(update).toHaveBeenCalledWith({ qualityScore: 50 }, expect.anything());
    await service.refreshAppliedCriteria('one', '99');
    expect(service.saveRun).toHaveBeenCalledTimes(1);
});
