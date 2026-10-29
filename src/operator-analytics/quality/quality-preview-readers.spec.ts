import { qualityDashboard, qualityEvidence, qualityReadScope, qualityDistributionPredicate } from './quality-dashboard';
import { QualityPreviewController } from './quality-preview.controller';
import { currentQualityProjection } from './current-quality-projection';
import { journalOrderExpression } from '../../ai-cdr/journal-order';
import { QualityReadQueryDto } from './quality-read-query.dto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

it('validates bounded read pagination and transforms numeric project selection', () => {
    const query = plainToInstance(QualityReadQueryDto, { projectId: '5', page: '1', limit: '20', order: 'worst' });
    expect(validateSync(query)).toHaveLength(0);
    expect(query.projectId).toBe(5);
    expect(validateSync(plainToInstance(QualityReadQueryDto, { page: '0', limit: '1001' }))).toHaveLength(2);
});

it('does not show or sort a stale 100 as current while detail republishes 65', () => {
    const stale = { qualityVersion: 'quality-v2.1', qualityStatus: 'scored', qualityScore: 100 };
    expect(currentQualityProjection(stale)).toMatchObject({ qualityStatus: 'needs_review', qualityScore: null });
    expect(stale.qualityScore).toBe(100);
    const current = { ...stale, qualityVersion: 'quality-v2.2', qualityScore: 65 };
    expect(currentQualityProjection(current)).toBe(current);
    expect(journalOrderExpression('qualityScore', 'postgres', true)).toContain("'quality-v2.2'");
});

it('routes all preview readers through authenticated scope and the preview projection', () => {
    const analyses = { getDashboard: jest.fn(), getCdrs: jest.fn(), getOperatorEvidence: jest.fn() };
    const controller = new QualityPreviewController({} as never, analyses as never);
    const req = { vpbxUserId: '99', tokenUserId: '1', isAdmin: false };
    controller.dashboard({ projectId: 5 }, req);
    controller.cdrs({ projectId: 5 }, req);
    controller.evidence({ projectId: 5 }, req);
    expect(analyses.getDashboard).toHaveBeenCalledWith({ projectId: 5 }, false, '99', true);
    expect(analyses.getCdrs).toHaveBeenCalledWith({ projectId: 5 }, false, '99', true);
    expect(analyses.getOperatorEvidence).toHaveBeenCalledWith({ projectId: 5 }, false, '99', '99', true);
    expect(() => controller.dashboard({}, {})).toThrow('Missing authenticated owner');
});
it('uses the same saved projection for SQL aggregates, evidence, outcomes and selected filters', async () => {
    const scope = qualityReadScope({ userId: 'other', projectId: 5, sources: '["external-api"]',
        people: '[{"userId":"99","operatorId":"302"}]', tagIds: '["service"]', csat: '5,none', callTypes: '["incoming"]' }, false, '99', true);
    expect(scope.replacements).toMatchObject({ owner: '99', project: 5, qualitySources: ['external-api'],
        qualityPerson0operatorId: '302', qualityTypes: ['incoming'], qualityTags: ['service'], qualityCsat: [5] });
    expect(scope.cte).toContain('LEFT JOIN "quality_preview_analytics"');
    expect(qualityDistributionPredicate({ success: false }, true)).toContain('FROM "quality_preview_analytics"');
    const query = jest.fn().mockRejectedValue(new Error('SQL captured'));
    const db = { getDialect: () => 'postgres', query };
    await expect(qualityDashboard(db as never, {}, false, '99', [], true)).rejects.toThrow('SQL captured');
    expect(query.mock.calls[0][0]).toContain('JOIN quality_preview_values');
    await expect(qualityEvidence(db as never, {}, false, '99', {}, true)).rejects.toThrow('SQL captured');
    expect(query.mock.calls[1][0]).toContain('JOIN quality_preview_runs');
    expect(query.mock.calls[1][0]).not.toContain('JOIN quality_analysis_runs');
});
