jest.mock('glob', () => ({ globSync: () => [] }));
import { OperatorAnalyticsService } from './operator-analytics.service';
import { QualityPreviewController } from './quality/quality-preview.controller';
import { enrichInsightsWithChannelIds } from './lib/insights-drilldown';
import { Op } from 'sequelize';

describe('dashboard insights selection', () => {
    const filters = { userId: '100', projectId: 5, sources: '["call"]', callTypes: '["incoming"]', people: '[{"userId":"99","operatorId":"207"}]', tagIds: '["booking"]', csat: '4,5', operatorFilters: '[{"userId":"99","operatorId":"207"}]', startDate: '2026-10-20', endDate: '2026-10-26' };
    it('uses the same filters and preview scores for both periods, with isolated cache keys', async () => {
        const service: any = Object.create(OperatorAnalyticsService.prototype);
        service.getDashboard = jest.fn().mockResolvedValue({ totalAnalyzed: 0, averageScore: 0, successRate: 0, aggregatedMetrics: {} });
        service.projectRepository = { findByPk: jest.fn().mockResolvedValue(null) };
        service.insightsCache = { get: jest.fn().mockResolvedValue(null) };
        await service.getInsights(filters, false, '99', '99', false);
        expect(service.getDashboard).toHaveBeenNthCalledWith(1, expect.objectContaining(filters), false, '99', false);
        expect(service.getDashboard).toHaveBeenNthCalledWith(2, expect.objectContaining({ ...filters, startDate: expect.any(String), endDate: expect.any(String) }), false, '99', false);
        const key = service.insightsCache.get.mock.calls[0][0];
        for (const field of ['sources', 'callTypes', 'people', 'tagIds', 'csat', 'operatorFilters']) {
            expect(service.buildInsightsCacheKey('99', filters, 'same')).not.toBe(service.buildInsightsCacheKey('99', { ...filters, [field]: 'changed' }, 'same'));
        }
        expect(key).toContain('legacy');
        expect(key).toContain(':99:');
    });
    it('forwards guarded identity and complete filters through the preview route', () => {
        const analyses: any = { getInsights: jest.fn() };
        new QualityPreviewController({} as any, analyses).insights(filters, { vpbxUserId: '99', isAdmin: false });
        expect(analyses.getInsights).toHaveBeenCalledWith(filters, false, '99', '99', true);
    });
    it('routes legacy insights through the dedicated model purpose and partitions their cache by model', async () => {
        const service: any = Object.create(OperatorAnalyticsService.prototype);
        Object.assign(service, {
            insightsDeepSeekModel: 'deepseek-v4-pro',
            getDashboard: jest.fn().mockResolvedValue({ totalAnalyzed: 20, averageScore: 80, successRate: .8, aggregatedMetrics: { greeting_quality: 80 } }),
            projectRepository: { findByPk: jest.fn().mockResolvedValue(null) },
            insightsCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
            chatWithFallback: jest.fn().mockResolvedValue({ content: JSON.stringify({ insights: [{ priority: 'high', type: 'gap', title: 'Качество приветствия', observation: 'greeting_quality = 58 при среднем 72', recommendation: 'Провести тренинг по скрипту приветствия', evidence: { metric: 'greeting_quality', value: 58 } }] }), usage: { total_tokens: 0 } }),
            aiCdrRepository: { findAll: jest.fn().mockResolvedValue([]), sequelize: { getDialect: () => 'postgres', escape: () => "'booking'" } },
            logger: { warn: jest.fn() }, chargeInsightCost: jest.fn(),
        });
        await service.getInsights(filters, false, '99', '99', false);
        expect(service.chatWithFallback.mock.calls[0][1]).toMatchObject({ purpose: 'insights' });
        const key = service.buildInsightsCacheKey('99', filters, 'same');
        service.insightsDeepSeekModel = 'deepseek-flash';
        expect(service.buildInsightsCacheKey('99', filters, 'same')).not.toBe(key);
    });
    it('scopes exemplars by tenant and all filters, removes unverified model IDs and uses preview analytics', async () => {
        const findAll = jest.fn().mockResolvedValue([]);
        const insight: any = { type: 'gap', evidence: { operators: ['Other'], channelIds: ['unverified'] } };
        const result = await enrichInsightsWithChannelIds([insight], { query: filters, aiCdrRepository: { findAll }, isAdmin: false, realUserId: '99', qualityPreview: true, database: { getDialect: () => 'postgres', escape: () => "'booking'" } as any, likeOp: value => ({ like: value }) });
        expect(result[0].evidence.channelIds).toEqual([]);
        const args = findAll.mock.calls[0][0];
        expect(args.where.userId).toBe('99');
        expect(args.where.projectId).toBe(5);
        expect(args.include[0].association).toBe('previewAnalytics');
        expect(args.where[Op.and].map((x: any) => x.val || '').join(' ')).toContain('quality_preview_analytics');
        expect(args.where[Op.and].map((x: any) => x.val || '').join(' ')).toContain('operator_call_tags');
    });
});
