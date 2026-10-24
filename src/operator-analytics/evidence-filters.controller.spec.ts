import { OperatorAnalyticsController } from './operator-analytics.controller';

describe('analytics filter propagation at the controller boundary', () => {
    const selection = JSON.stringify([{ userId: '99', operatorId: '203' }, { userId: '99', operatorId: '218' }]);
    let service: { getOperatorEvidence: jest.Mock; getDashboard: jest.Mock; getCdrs: jest.Mock };
    let controller: OperatorAnalyticsController;
    beforeEach(() => {
        service = { getOperatorEvidence: jest.fn().mockResolvedValue({ metrics: [] }), getDashboard: jest.fn(), getCdrs: jest.fn() };
        controller = new OperatorAnalyticsController(service as any, {} as any, {} as any);
    });

    it.each(['incoming', 'outgoing', 'internal'] as const)('retains the operator union and %s type for evidence', async callType => {
        await controller.getOperatorEvidence({ isAdmin: false, tokenUserId: '7', vpbxUserId: '99' } as any, {
            projectId: 5, operatorFilters: selection, callType, metricId: 'greeting_quality', evidencePage: 2, evidencePageSize: 20,
        });
        expect(service.getOperatorEvidence).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 5, operatorFilters: selection, callType, metricId: 'greeting_quality', evidencePage: 2, evidencePageSize: 20,
        }), false, '99', '99');
    });

    it('keeps admin scope and exact legacy identity alongside the new filters', async () => {
        await controller.getOperatorEvidence({ isAdmin: true, tokenUserId: '1' } as any, {
            userId: '99', operatorName: '  Operator  ', operatorId: '203', operatorFilters: selection, callType: 'outgoing',
        });
        expect(service.getOperatorEvidence).toHaveBeenCalledWith(expect.objectContaining({
            userId: '99', operatorName: 'Operator', operatorId: '203', operatorFilters: selection, callType: 'outgoing',
        }), true, null, '1');
    });

    it('passes the same scoped selection through all three dashboard read routes', async () => {
        const request = { isAdmin: false, vpbxUserId: '99' } as any;
        const query = { projectId: 5, operatorFilters: selection, callType: 'internal' as const };
        await controller.getDashboard(request, query);
        await controller.getCdrs(request, query);
        expect(service.getDashboard).toHaveBeenCalledWith(query, false, '99');
        expect(service.getCdrs).toHaveBeenCalledWith(query, false, '99');
    });
});
