import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HelpdeskEmailContextService } from './helpdesk-email-context.service';

describe('HelpdeskEmailContextService', () => {
    const users = { findByPk: jest.fn(), findAll: jest.fn() };
    const projects = { findAll: jest.fn() };
    const transcripts = { findAll: jest.fn() };
    const calls = { findAll: jest.fn() };
    const assistants = { findAll: jest.fn() };
    const rates = { findOne: jest.fn() };
    let service: HelpdeskEmailContextService;
    const admin = { id: 1, banned: false, isActivated: true, roles: [{ value: 'ADMIN' }] };
    const project = { id: 7, userId: '20', name: 'Sales', webhookHeaders: { Authorization: 'secret' }, callTaxonomy: [{ id: 'topic' }] };
    beforeEach(() => {
        jest.resetAllMocks();
        process.env.TENANT_CURRENCY = 'USD';
        assistants.findAll.mockResolvedValue([{ id: 4, name: 'Reception', apiKey: 'secret' }]);
        service = new HelpdeskEmailContextService(users as never, projects as never, transcripts as never, calls as never, assistants as never, rates as never);
        users.findByPk.mockResolvedValueOnce(admin).mockResolvedValue({ id: 20, banned: false, vpbx_user_id: null, balance: 2.5 });
        users.findAll.mockResolvedValue([{ id: 21, email: 'user@example.test', vpbx_user_id: 20, banned: false }]);
        projects.findAll.mockResolvedValue([project]);
        transcripts.findAll.mockResolvedValue([{ id: 8, transcription: 'x'.repeat(9000), get: () => new Date() }]);
        calls.findAll.mockResolvedValue([{ channelId: '8', analytics: { summary: 'summary', metrics: { success: true } }, get: () => new Date() }]);
    });
    it('returns assistants and balance without requiring any analytics project', async () => {
        const result = await service.getContext(1, { email: 'user@example.test', scope: 'cabinet' });
        expect(result).toMatchObject({ found: true, contextScope: 'cabinet', projectId: null,
            balance: { amount: 2.5, currency: 'USD', available: true }, assistantLiveStatusVerified: false });
        expect('assistants' in result && result.assistants?.[0]).not.toHaveProperty('apiKey');
        expect(assistants.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 20 } }));
        expect(projects.findAll).not.toHaveBeenCalled(); expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('converts USD storage into tenant currency using verified rates', async () => {
        process.env.TENANT_CURRENCY = 'RUB';
        rates.findOne.mockResolvedValueOnce({ rate: 90 }).mockResolvedValueOnce({ rate: 1 });
        expect(await service.getContext(1, { email: 'user@example.test', scope: 'cabinet' }))
            .toMatchObject({ balance: { amount: 225, currency: 'RUB', available: true } });
    });
    it('does not label USD storage as RUB when exchange rates are missing', async () => {
        process.env.TENANT_CURRENCY = 'RUB'; rates.findOne.mockResolvedValue(null);
        expect(await service.getContext(1, { email: 'user@example.test', scope: 'cabinet' }))
            .toMatchObject({ balance: { amount: null, currency: 'RUB', available: false } });
    });
    it('rejects missing API key owner before any lookup', async () => {
        await expect(service.getContext(undefined, { email: 'user@example.test' })).rejects.toThrow(ForbiddenException);
        expect(users.findAll).not.toHaveBeenCalled();
    });
    it.each([
        { ...admin, roles: [{ value: 'USER' }] },
        { ...admin, banned: true },
        { ...admin, isActivated: false },
    ])('rejects inactive, banned or non-admin API key owner', async actor => {
        users.findByPk.mockReset().mockResolvedValue(actor);
        await expect(service.getContext(1, { email: 'user@example.test' })).rejects.toThrow(ForbiddenException);
        expect(users.findAll).not.toHaveBeenCalled();
    });
    it('matches normalized email, resolves a sub-user to cabinet owner and scopes all project samples', async () => {
        const result = await service.getContext(1, { email: ' USER@EXAMPLE.TEST ', projectId: 7 });
        expect(result).toMatchObject({ found: true, clientId: '20', projectId: 7 });
        expect(projects.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: '20', id: 7 } }));
        for (const repository of [transcripts, calls]) {
            expect(repository.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: '20', projectId: 7 } }));
        }
        expect(result.project).not.toHaveProperty('webhookHeaders');
        expect(result.transcripts?.[0].text).toHaveLength(8000);
        expect(users.findAll.mock.calls[0][0].attributes).not.toContain('password');
    });
    it('does not guess a client when normalized emails match multiple accounts', async () => {
        users.findAll.mockResolvedValue([{ id: 20 }, { id: 30 }]);
        expect(await service.getContext(1, { email: 'user@example.test' })).toMatchObject({ found: false, ambiguous: true });
        expect(projects.findAll).not.toHaveBeenCalled();expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('does not guess among multiple projects and never reads transcripts until selection', async () => {
        projects.findAll.mockResolvedValue([project, { ...project, id: 9 }]);
        expect(await service.getContext(1, { email: 'user@example.test' })).toMatchObject({ found: false, ambiguous: true, reason: 'multiple_projects' });
        expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('does not fall back to another project when an explicit project is outside the tenant', async () => {
        projects.findAll.mockResolvedValue([]);
        expect(await service.getContext(1, { email: 'user@example.test', projectId: 999 })).toMatchObject({ found: false, reason: 'project_not_found' });
        expect(projects.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: '20', id: 999 } }));
        expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('rejects invalid email and invalid project IDs even when global validation skips missing fields', async () => {
        await expect(service.getContext(1, { email: '' })).rejects.toThrow(BadRequestException);
        users.findByPk.mockReset().mockResolvedValue(admin);
        await expect(service.getContext(1, { email: 'user@example.test', projectId: -1 })).rejects.toThrow(BadRequestException);
        expect(users.findAll).not.toHaveBeenCalled();
    });
    it('rejects broken or nested tenant ownership', async () => {
        users.findByPk.mockReset().mockResolvedValueOnce(admin).mockResolvedValue({ id: 20, vpbx_user_id: 30 });
        expect(await service.getContext(1, { email: 'user@example.test' })).toMatchObject({ found: false, reason: 'cabinet_unavailable' });
        expect(projects.findAll).not.toHaveBeenCalled();
    });
});
