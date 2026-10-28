import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HelpdeskTopicSchemeController } from './helpdesk-topic-scheme.controller';
const revision = 'ba68966e-e44d-40e9-b240-f2c71cad9132';
function fixture() {
    const bound = { getBoundSupportContext: jest.fn().mockResolvedValue({ clientId: '99', projectId: 5 }) };
    const schemes = { draft: jest.fn().mockResolvedValue({ draft: { revision, checks: [], scheme: {}, baselineHash: 'b'.repeat(64), helpdeskRequestId: 'a'.repeat(32) } }),
        check: jest.fn().mockResolvedValue({ state: { draft: { revision, scheme: {}, checks: [] } } }), apply: jest.fn().mockResolvedValue({ active: { revision }, draft: null }) };
    const controller = new HelpdeskTopicSchemeController(bound as any, schemes as any, {} as any);
    return { bound, schemes, controller };
}
const request = (stage: string, input: unknown) => ({ cabinetId: 99, projectId: 5, stage, input });
describe('scoped helpdesk checked topic schemes', () => {
    it('rejects unauthorised scope before any draft, check or activation', async () => {
        const { bound, schemes, controller } = fixture(); bound.getBoundSupportContext.mockRejectedValue(new ForbiddenException());
        await expect(controller.run(request('apply', { revision }), { apiKeyUserId: 8 })).rejects.toBeInstanceOf(ForbiddenException);
        expect(schemes.apply).not.toHaveBeenCalled();
    });
    it('passes confirmed owner with admin=false, optimistic baseline and structure guard', async () => {
        const { bound, schemes, controller } = fixture();
        const input = { scheme: {}, expectedDraftRevision: null, expectedBaselineHash: 'b'.repeat(64), helpdeskRequestId: 'a'.repeat(32) };
        const out = await controller.run(request('draft', input), { apiKeyUserId: 1 });
        expect(bound.getBoundSupportContext).toHaveBeenCalledWith(1, { cabinetId: 99, projectId: 5 });
        expect(schemes.draft).toHaveBeenCalledWith(5, '99', false, { ...input, preserveStructure: true });
        expect(out.clientId).toBe('99'); expect(schemes.apply).not.toHaveBeenCalled();
    });
    it('refuses context, authority and unknown fields inside draft input', async () => {
        for (const extra of [{ projectId: 6 }, { businessContext: 'Changed' }, { admin: true }, { preserveStructure: false }]) {
            const { schemes, controller } = fixture();
            await expect(controller.run(request('draft', { scheme: {}, expectedDraftRevision: null, expectedBaselineHash: 'b'.repeat(64), helpdeskRequestId: 'a'.repeat(32), ...extra }), { apiKeyUserId: 1 })).rejects.toBeInstanceOf(BadRequestException);
            expect(schemes.draft).not.toHaveBeenCalled();
        }
    });
    it('requires labelled bounded checks and never turns checking into activation', async () => {
        const { controller, schemes } = fixture();
        await expect(controller.run(request('check', { revision, cases: [{ text: 'A synthetic case' }] }), { apiKeyUserId: 1 })).rejects.toBeInstanceOf(BadRequestException);
        const cases = ['booking', 'results', 'other'].map(expectedTopicId => ({ text: 'Synthetic conversation ' + expectedTopicId, expectedTopicId }));
        await controller.run(request('check', { revision, cases }), { apiKeyUserId: 1 });
        expect(schemes.check).toHaveBeenCalledWith(5, '99', false, { revision, cases }); expect(schemes.apply).not.toHaveBeenCalled();
    });
    it('delegates only the exact activation revision to the guarded checked workflow', async () => {
        const { controller, schemes } = fixture();
        await controller.run(request('apply', { revision }), { apiKeyUserId: 1 });
        expect(schemes.apply).toHaveBeenCalledWith(5, '99', false, revision);
    });
});
