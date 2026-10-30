jest.mock('glob', () => ({ globSync: () => [] }));
import { OperatorAnalyticsService } from './operator-analytics.service';
import { insightPeriodData } from './lib/insight-evidence';
jest.mock('./lib/insight-evidence', () => ({ insightPeriodData: jest.fn() }));

describe('verified insight generation boundary', () => {
    const filters = { userId: '99', projectId: 5, startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-26T23:59:59.999Z', sources: '["call"]', callTypes: '["incoming"]', tagIds: '["booking"]', people: '[{"userId":"99","operatorId":"207"}]', csat: '4', timezone: 'Asia/Krasnoyarsk' };
    const rule = { id: 'custom-name', origin: 'custom', type: 'number', name: 'Критерий', included: true, normalization: { kind: 'linear', min: 0, max: 10, inverted: true }, weight: 2, critical: 'none' };
    let service: any;
    beforeEach(() => {
        service = Object.create(OperatorAnalyticsService.prototype);
        service.insightsDeepSeekModel = 'deepseek-v4-pro';
        Object.assign(service, { aiCdrRepository: { sequelize: {} }, projectRepository: { findByPk: jest.fn().mockResolvedValue({ customMetricsSchema: [], qualityScoreConfig: {}, systemPrompt: 'Project context' }) }, insightsCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() }, chargeInsightCost: jest.fn(), chatWithFallback: jest.fn().mockImplementation(async (messages: any[]) => {
            const facts = JSON.parse(messages[1].content).facts;
            return { content: JSON.stringify({ insights: [{ factId: facts[0].factId, actionId: 'checklist' }] }), usage: { total_tokens: 10 } };
        }) });
        (insightPeriodData as jest.Mock).mockReset().mockResolvedValue({ total: 20, scored: 20, score: 40, historical: 20, excludedLowQualityCount: 20, coverage: 1, scorecards: ['rules'], metrics: [{ metricId: 'custom-name', origin: 'custom', rule, status: 'assessed', category: null, n: 20, normalized: 40, average: 6, trueCount: 0, lowIds: ['exact'], highIds: ['high'] }] });
    });
    it('forwards every filter to both periods; only sends approved facts and enforces current tenant', async () => {
        const output = await service.getInsights({ ...filters, userId: 'forged' }, false, '99', '99', true);
        expect(insightPeriodData).toHaveBeenNthCalledWith(1, {}, expect.objectContaining({ ...filters, userId: 'forged', startDate: expect.any(String), endDate: expect.any(String) }), false, '99');
        expect(insightPeriodData).toHaveBeenNthCalledWith(2, {}, expect.objectContaining({ people: filters.people, csat: '4', sources: filters.sources, callTypes: filters.callTypes, tagIds: filters.tagIds }), false, '99');
        const prompt = service.chatWithFallback.mock.calls[0][0][1].content;
        expect(service.chatWithFallback.mock.calls[0][1]).toMatchObject({ purpose: 'insights' });
        expect(prompt).not.toContain('excludedLowQualityCount'); expect(prompt).not.toContain('historical'); expect(prompt).not.toContain('exact');
        expect(output.insights[0].evidence.channelIds).toEqual(['exact']);
        expect(output.insights[0].evidence.value).toBe(40);
        expect(output.insights[0].recommendation).toContain('чек-лист');
    });
    it('separates cache by audience, context and complete selection', async () => {
        await service.getInsights(filters, false, '99', '99', true);
        const first = service.insightsCache.get.mock.calls[0][0];
        await service.getInsights(filters, true, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[1][0]).not.toBe(first);
        service.projectRepository.findByPk.mockResolvedValue({ customMetricsSchema: [], systemPrompt: 'Changed context' });
        await service.getInsights(filters, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[2][0]).not.toBe(first);
        await service.getInsights({ ...filters, csat: '5' }, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[3][0]).not.toBe(service.insightsCache.get.mock.calls[2][0]);
        service.insightsDeepSeekModel = 'deepseek-flash';
        await service.getInsights({ ...filters, csat: '5' }, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[4][0]).not.toBe(service.insightsCache.get.mock.calls[3][0]);
    });
    it('does not invoke a model for unassessed data and replaces malformed generated prose with server-owned facts', async () => {
        (insightPeriodData as jest.Mock).mockResolvedValueOnce({ total: 30, scored: 0, metrics: [] }).mockResolvedValueOnce({ total: 30, scored: 0, metrics: [] });
        expect((await service.getInsights(filters, false, '99', '99', true)).lowConfidence).toBe(true);
        expect(service.chatWithFallback).not.toHaveBeenCalled();
        service.chatWithFallback.mockResolvedValue({ content: '{"insights":[{"factId":"invented","observation":"100%"}]}', usage: { total_tokens: 5 } });
        const output = await service.getInsights(filters, false, '99', '99', true);
        expect(output.insights[0].observation).not.toContain('100%');
        expect(output.insights[0].evidence.channelIds).toEqual(['exact']);
    });
});
