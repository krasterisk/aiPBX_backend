jest.mock('glob', () => ({ globSync: () => [] }));
import { OperatorAnalyticsService } from './operator-analytics.service';
import { insightPeriodData } from './lib/insight-evidence';
import { insightCallEvidence } from './lib/insight-call-evidence';
jest.mock('./lib/insight-evidence', () => ({ insightPeriodData: jest.fn() }));
jest.mock('./lib/insight-call-evidence', () => ({ ...jest.requireActual('./lib/insight-call-evidence'), insightCallEvidence: jest.fn() }));

describe('verified insight generation boundary', () => {
    const filters = { userId: '99', projectId: 5, startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-26T23:59:59.999Z', sources: '["call"]', callTypes: '["incoming"]', tagIds: '["booking"]', people: '[{"userId":"99","operatorId":"207"}]', csat: '4', timezone: 'Asia/Krasnoyarsk' };
    const rule = { id: 'custom-name', origin: 'custom', type: 'number', name: 'Критерий', included: true, normalization: { kind: 'linear', min: 0, max: 10, inverted: true }, weight: 2, critical: 'none' };
    let service: any;
    beforeEach(() => {
        service = Object.create(OperatorAnalyticsService.prototype);
        service.insightsDeepSeekModel = 'deepseek-v4-pro';
        Object.assign(service, { aiCdrRepository: { sequelize: {} }, projectRepository: { findOne: jest.fn().mockResolvedValue({ customMetricsSchema: [], qualityScoreConfig: {}, systemPrompt: 'Project context' }) }, insightsCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() }, chargeInsightCost: jest.fn(), chatWithFallback: jest.fn().mockImplementation(async (messages: any[], options: { schemaName: string }) => {
            if (options.schemaName === 'actionable_insight_review') return { content: JSON.stringify({ reviews: JSON.parse(messages[1].content).drafts.map(f => ({ factId: f.factId, evidenceSupported: true, actionAppropriate: true, checkMeasurable: true, reason: 'supported' })) }), usage: { total_tokens: 5 } };
            const facts = JSON.parse(messages[1].content).facts;
            const content = JSON.stringify({ insights: [{ factId: facts[0].factId, mode: 'process', scopeRuleQuote: '', title: 'Не повторяют параметры новой записи',
                finding: 'В проверенных разговорах операторы завершают оформление без подтверждения параметров записи.',
                applicability: 'Клиенты оформляют новую запись, поэтому требуется повторить согласованные условия.',
                action: 'Перед завершением новой записи повторять согласованные дату, время и адрес, затем получить подтверждение клиента.',
                verification: 'Отмечать повторение параметров и подтверждение клиента; сравнить выполнение этого же критерия на сопоставимых звонках.',
                successCondition: 'Клиент подтверждает услышанные параметры, а оператор фиксирует согласованные условия.',
                guardrail: 'Не менять согласованные параметры и не оформлять ненужную повторную запись.',
                examples: facts[0].examples.filter(e => e.period === 'current').map(e => ({ id: e.id, quote: 'Запись оформлена, до свидания.', applicabilityQuote: 'Хочу записаться на консультацию.' })),
            }] });
            return { content, usage: { total_tokens: 10 } };
        }) });
        (insightPeriodData as jest.Mock).mockReset().mockResolvedValue({ total: 20, scored: 20, score: 40, historical: 20, excludedLowQualityCount: 20, coverage: 1, scorecards: ['rules'], metrics: [{ metricId: 'custom-name', origin: 'custom', rule, status: 'assessed', category: null, n: 20, normalized: 40, average: 6, trueCount: 0, lowIds: ['exact', 'exact-two'], highIds: ['high'] }] });
        (insightCallEvidence as jest.Mock).mockReset().mockImplementation(async (_db, _q, _admin, _owner, facts, period) => period === 'previous' ? [] : facts.flatMap(f => ['a', 'b'].map((id, i) => ({
            id, factId: f.evidence.factId, channelId: i ? 'exact-two' : 'exact', period, runId: 'run-' + id, complete: true, operator: id, topics: [], instruction: 'Повторять параметры новой записи.',
            transcript: 'Клиент: Хочу записаться на консультацию. Оператор: Запись оформлена, до свидания.', assessment: { status: 'assessed', rationale: '', quote: '' },
        }))));
    });
    it('forwards every filter to both periods; only sends approved facts and enforces current tenant', async () => {
        const output = await service.getInsights({ ...filters, userId: 'forged' }, false, '99', '99', true);
        expect(insightPeriodData).toHaveBeenNthCalledWith(1, {}, expect.objectContaining({ ...filters, userId: 'forged', startDate: expect.any(String), endDate: expect.any(String) }), false, '99');
        expect(insightPeriodData).toHaveBeenNthCalledWith(2, {}, expect.objectContaining({ people: filters.people, csat: '4', sources: filters.sources, callTypes: filters.callTypes, tagIds: filters.tagIds }), false, '99');
        const prompt = service.chatWithFallback.mock.calls[0][0][1].content;
        expect(service.chatWithFallback.mock.calls[0][1]).toMatchObject({ purpose: 'insights' });
        expect(prompt).not.toContain('excludedLowQualityCount'); expect(prompt).not.toContain('historical'); expect(prompt).not.toContain('exact');
        expect(output.insights[0].evidence.channelIds).toEqual(['exact', 'exact-two']);
        expect(output.insights[0].evidence.value).toBe(40);
        expect(output.insights[0].recommendation).toContain('Перед завершением новой записи');
        expect(output.insights[0].recommendation).toContain('Признак результата:');
        expect(service.chatWithFallback.mock.calls[0][1].validateContent).toBeInstanceOf(Function);
        expect(service.chatWithFallback.mock.calls[1][1]).toMatchObject({ purpose: 'insights', schemaName: 'actionable_insight_review' });
        expect(service.chargeInsightCost).toHaveBeenCalledWith('99', 15, 'Dashboard verified insight');
        expect(service.projectRepository.findOne).toHaveBeenCalledWith({ where: { id: 5, userId: '99' } });
        expect(insightCallEvidence).toHaveBeenNthCalledWith(1, {}, expect.objectContaining({ ...filters, userId: 'forged', startDate: expect.any(String), endDate: expect.any(String) }), false, '99', expect.any(Array), 'current');
    });
    it('separates cache by audience, context and complete selection', async () => {
        await service.getInsights(filters, false, '99', '99', true);
        const first = service.insightsCache.get.mock.calls[0][0];
        await service.getInsights(filters, true, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[1][0]).not.toBe(first);
        service.projectRepository.findOne.mockResolvedValue({ customMetricsSchema: [], systemPrompt: 'Changed context' });
        await service.getInsights(filters, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[2][0]).not.toBe(first);
        await service.getInsights({ ...filters, csat: '5' }, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[3][0]).not.toBe(service.insightsCache.get.mock.calls[2][0]);
        service.insightsDeepSeekModel = 'deepseek-flash';
        await service.getInsights({ ...filters, csat: '5' }, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[4][0]).not.toBe(service.insightsCache.get.mock.calls[3][0]);
    });
    it('does not invoke a model for unassessed data and never substitutes boilerplate for an invalid response', async () => {
        (insightPeriodData as jest.Mock).mockResolvedValueOnce({ total: 30, scored: 0, metrics: [] }).mockResolvedValueOnce({ total: 30, scored: 0, metrics: [] });
        expect((await service.getInsights(filters, false, '99', '99', true)).lowConfidence).toBe(true);
        expect(service.chatWithFallback).not.toHaveBeenCalled();
        service.chatWithFallback.mockResolvedValue({ content: '{"insights":[{"factId":"invented","observation":"100%"}]}', usage: { total_tokens: 5 } });
        await expect(service.getInsights(filters, false, '99', '99', true)).rejects.toThrow('Insufficient evidence');
        expect(service.chargeInsightCost).not.toHaveBeenCalled();
        expect(service.insightsCache.set).not.toHaveBeenCalled();
    });
    it('does not generate or charge for bare metric averages without source conversations', async () => {
        (insightCallEvidence as jest.Mock).mockResolvedValue([]);
        expect((await service.getInsights(filters, false, '99', '99', true)).insights).toEqual([]);
        expect(service.chatWithFallback).not.toHaveBeenCalled();
        expect(service.chargeInsightCost).not.toHaveBeenCalled();
    });
    it('invalidates old advice when source evidence changes and validates the provider response before acceptance', async () => {
        await service.getInsights(filters, false, '99', '99', true);
        const key = service.insightsCache.get.mock.calls[0][0];
        const original = (insightCallEvidence as jest.Mock).getMockImplementation()!;
        (insightCallEvidence as jest.Mock).mockImplementation(async (...args) => (await original(...args)).map(c => ({ ...c, transcript: c.transcript + ' Клиент: Спасибо за помощь.' })));
        await service.getInsights(filters, false, '99', '99', true);
        expect(service.insightsCache.get.mock.calls[1][0]).not.toBe(key);
        expect(() => service.chatWithFallback.mock.calls[0][1].validateContent('{"insights":[{"factId":"forged"}]}')).toThrow();
    });
    it('reuses the same cache identity within a live period when only wall-clock time moves', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-15T10:00:00Z'));
        try {
            const query = { ...filters, startDate: '2026-10-01', endDate: '2026-10-31' };
            await service.getInsights(query, false, '99', '99', true);
            const key = service.insightsCache.get.mock.calls[0][0];
            jest.setSystemTime(new Date('2026-10-15T10:01:00Z'));
            await service.getInsights(query, false, '99', '99', true);
            expect(service.insightsCache.get.mock.calls[1][0]).toBe(key);
        } finally { jest.useRealTimers(); }
    });
    it('removes an unsupported plan rejected by the fact checker without a statistical/template replacement', async () => {
        const generate = service.chatWithFallback.getMockImplementation();
        service.chatWithFallback.mockImplementation(async (messages, options) => options.schemaName === 'actionable_insight_review'
            ? { content: JSON.stringify({ reviews: JSON.parse(messages[1].content).drafts.map(f => ({ factId: f.factId, evidenceSupported: false, actionAppropriate: false, checkMeasurable: true, reason: 'unsupported_applicability' })) }), usage: { total_tokens: 5 } } : generate(messages, options));
        const output = await service.getInsights(filters, false, '99', '99', true);
        expect(output.insights).toEqual([]);
        expect(output.promptVersion).toBe('verified-insights-2-actionable');
        expect(service.chargeInsightCost).toHaveBeenCalledWith('99', 15, 'Dashboard verified insight');
    });
    it('cannot expose a foreign project context even if historical call data is incorrectly associated with that project', async () => {
        service.projectRepository.findOne.mockResolvedValue(null);
        await expect(service.getInsights({ ...filters, projectId: 500 }, false, '99', '99', true)).rejects.toThrow('Project not found');
        expect(service.projectRepository.findOne).toHaveBeenCalledWith({ where: { id: 500, userId: '99' } });
        expect(insightPeriodData).not.toHaveBeenCalled();
        expect(service.chatWithFallback).not.toHaveBeenCalled();
    });
});
