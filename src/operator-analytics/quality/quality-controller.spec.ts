import { OperatorAnalyticsController } from '../operator-analytics.controller';

describe('quality API authorization boundary', () => {
    const service = { qualityDetail: jest.fn(), qualityHistory: jest.fn(), qualityRules: jest.fn() };
    const controller = new OperatorAnalyticsController(service as any, {} as any, {} as any);
    beforeEach(() => jest.clearAllMocks());
    it('uses the authenticated VPBX owner for detail, history and rules', async () => {
        const req = { vpbxUserId: '99', tokenUserId: '7', isAdmin: false } as any;
        await controller.qualityDetail('one', undefined, req);
        await controller.qualityHistory('one', '20', undefined, req);
        await controller.saveQualityRules('5', { minimumCoverage: 0.9 }, req);
        expect(service.qualityDetail).toHaveBeenCalledWith('one', '99', false, undefined);
        expect(service.qualityHistory).toHaveBeenCalledWith('one', '99', false, 20, undefined);
        expect(service.qualityRules).toHaveBeenCalledWith(5, '99', false, { minimumCoverage: 0.9 });
    });
    it('rejects unauthenticated reads and malformed cursors before reaching storage', async () => {
        await expect(controller.qualityDetail('one', undefined, {} as any)).rejects.toThrow('Unauthorized');
        await expect(
            controller.qualityHistory('one', '1000', undefined, { tokenUserId: '99' } as any)
        ).rejects.toThrow();
        await expect(controller.qualityDetail('one', 'not-a-run', { tokenUserId: '99' } as any)).rejects.toThrow();
        expect(service.qualityDetail).not.toHaveBeenCalled();
    });
});
