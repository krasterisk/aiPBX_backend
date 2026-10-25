import { AiCdrController } from './ai-cdr.controller';

describe('journal controller scope', () => {
    const service = { get: jest.fn(), getJournalOptions: jest.fn() };
    const controller = new AiCdrController(service as any);
    beforeEach(() => jest.clearAllMocks());
    it('forwards journal selections unchanged but derives account from authenticated PBX identity', () => {
        const query = { userId: 'foreign', people: '[{"userId":"foreign","operatorId":"218"}]' };
        controller.journal(query as any, { tokenUserId: '1', vpbxUserId: '99' } as any);
        expect(service.get).toHaveBeenCalledWith(query, false, '99', true);
    });
    it('keeps legacy /page on its original service mode', () => {
        controller.get({ userId: '99' } as any, { tokenUserId: '99' } as any);
        expect(service.get).toHaveBeenCalledWith({ userId: '99' }, false, '99');
    });
    it('scopes options by authenticated account and lets an authenticated admin select a cabinet', () => {
        const query = { userId: '99' };
        controller.journalOptions(query as any, { tokenUserId: '99' } as any);
        expect(service.getJournalOptions).toHaveBeenLastCalledWith(query, false, '99');
        controller.journalOptions(query as any, { isAdmin: true } as any);
        expect(service.getJournalOptions).toHaveBeenLastCalledWith(query, true, null);
    });
});
