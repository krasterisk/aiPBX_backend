import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TopicSchemeService } from './topic-scheme.service';
import { topicSchemeBaseline } from './lib/topic-scheme';

function fixture() {
    const p: any = { id: 5, userId: '99', singleTopic: false, topicSchemeState: null, systemPrompt: 'Business context', customMetricsSchema: [],
        callTaxonomy: ['a', 'b', 'c'].map(id => ({ id, name: id, aliases: [] })),
        get() { return JSON.parse(JSON.stringify(this)); }, save: jest.fn(async () => p) };
    const projects: any = { sequelize: { transaction: async (fn: any) => fn({ LOCK: { UPDATE: 'UPDATE' } }) },
        findOne: jest.fn(async ({ where }: any) => where.id === p.id && (!where.userId || where.userId === p.userId) ? p : null) };
    const analytics: any = { previewTopicScheme: jest.fn(async (text: string) => ({ topicIds: [text.includes('booking') ? 'a' : text.includes('results') ? 'b' : 'c'], model: 'deepseek-flash', decision: {} })) };
    const service = new TopicSchemeService(projects, analytics);
    const scheme = { version: 1, fallbackTopicId: 'c', topics: p.callTaxonomy.map((t: any) => ({ id: t.id, name: t.name, when: 'criteria', exclude: '', examples: [] })) };
    const draft = async () => (await service.draft(5, '99', false, { scheme, expectedDraftRevision: p.topicSchemeState?.draft?.revision ?? null })).draft!;
    const cases = ['booking', 'results', 'other'].map((text, i) => ({ text: `Synthetic ${text} transcript`, expectedTopicId: ['a', 'b', 'c'][i] }));
    return { p, projects, analytics, service, scheme, draft, cases };
}

describe('TopicSchemeService ownership and apply gates', () => {
    it('does not expose or test another tenant project', async () => {
        const { service, analytics } = fixture();
        await expect(service.read(5, '100', false)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.check(5, '100', false, { revision: 'ba68966e-e44d-40e9-b240-f2c71cad9132', cases: [{ text: 'Synthetic conversation' }] })).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.read(5, '', true)).rejects.toBeInstanceOf(NotFoundException);
        expect(analytics.previewTopicScheme).not.toHaveBeenCalled();
    });
    it('requires fresh optimistic draft revision and rejects unchecked application', async () => {
        const { service, draft, scheme } = fixture();
        const d = await draft();
        await expect(service.draft(5, '99', false, { scheme, expectedDraftRevision: null })).rejects.toBeInstanceOf(ConflictException);
        await expect(service.apply(5, '99', false, d.revision)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('applies checked rules atomically, retains history and never persists conversation text', async () => {
        const { service, draft, cases, p } = fixture();
        const d = await draft();
        const checked = await service.check(5, '99', false, { revision: d.revision, cases });
        expect(checked.results).toHaveLength(3);
        expect(JSON.stringify(p.topicSchemeState)).not.toContain('Synthetic');
        const active = await service.apply(5, '99', false, d.revision);
        expect(active.draft).toBeNull();
        expect(active.active.revision).toBe(d.revision);
        expect(active.history).toHaveLength(1);
        expect(p.singleTopic).toBe(true);
        await expect(service.apply(5, '99', false, d.revision)).rejects.toBeInstanceOf(ConflictException);
    });
    it('rejects a changed project, a known wrong labelled result and a failed model request', async () => {
        const first = fixture();
        const d1 = await first.draft(); first.p.systemPrompt = 'Changed business context';
        await expect(first.service.check(5, '99', false, { revision: d1.revision, cases: first.cases })).rejects.toBeInstanceOf(ConflictException);
        const second = fixture(); const d2 = await second.draft();
        await second.service.check(5, '99', false, { revision: d2.revision, cases: [...second.cases, { text: 'Synthetic booking request', expectedTopicId: 'c' }] });
        await expect(second.service.apply(5, '99', false, d2.revision)).rejects.toBeInstanceOf(BadRequestException);
        const third = fixture(); const d3 = await third.draft();
        await third.service.check(5, '99', false, { revision: d3.revision, cases: third.cases });
        third.analytics.previewTopicScheme.mockRejectedValue(new Error('private provider failure'));
        await expect(third.service.check(5, '99', false, { revision: d3.revision, cases: third.cases })).rejects.toBeInstanceOf(BadRequestException);
        expect(third.p.topicSchemeState.draft.checkRun.status).toBe('failed');
        await expect(third.service.apply(5, '99', false, d3.revision)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('cannot attach late check results to a newer draft', async () => {
        const { service, draft, cases, analytics, p } = fixture();
        const original = await draft();
        let finish: () => void;
        const gate = new Promise<void>(resolve => { finish = resolve; });
        analytics.previewTopicScheme.mockImplementation(async () => { await gate; return { topicIds: ['a'], model: 'flash' }; });
        const work = service.check(5, '99', false, { revision: original.revision, cases: [cases[0]] });
        while (!analytics.previewTopicScheme.mock.calls.length) await new Promise(resolve => setImmediate(resolve));
        const newer = await draft();
        finish!();
        await expect(work).rejects.toBeInstanceOf(ConflictException);
        expect(p.topicSchemeState.draft.revision).toBe(newer.revision);
        expect(p.topicSchemeState.draft.checks).toEqual([]);
    });
    it('checks optional context cleanup without changing production context before successful apply', async () => {
        const { service, scheme, cases, p, analytics } = fixture();
        const cleanedContext = 'Clinic background without topic criteria';
        const d = (await service.draft(5, '99', false, { scheme, expectedDraftRevision: null, businessContext: cleanedContext })).draft!;
        expect(p.systemPrompt).toBe('Business context');
        await service.check(5, '99', false, { revision: d.revision, cases });
        expect(analytics.previewTopicScheme.mock.calls[0][1].systemPrompt).toBe(cleanedContext);
        expect(p.systemPrompt).toBe('Business context');
        await service.apply(5, '99', false, d.revision);
        expect(p.systemPrompt).toBe(cleanedContext);
    });
});


describe('helpdesk optimistic and structural draft guard', () => {
    it('rejects a stale project baseline under the draft lock', async () => {
        const { service, scheme, p } = fixture();
        const original = await service.draft(5, '99', false, { scheme, expectedDraftRevision: null });
        p.topicSchemeState = { active: original.draft, draft: null, history: [] };
        const before = JSON.stringify(p.topicSchemeState);
        await expect(service.draft(5, '99', false, { scheme, expectedDraftRevision: null, expectedBaselineHash: 'a'.repeat(64), preserveStructure: true })).rejects.toBeInstanceOf(ConflictException);
        expect(JSON.stringify(p.topicSchemeState)).toBe(before);
    });
    it('preserves identities, names, order and fallback, allowing only checked criteria changes', async () => {
        for (const kind of ['name', 'order', 'fallback', 'valid']) {
            const { service, scheme, p } = fixture();
            const original = await service.draft(5, '99', false, { scheme, expectedDraftRevision: null });
            p.topicSchemeState = { active: original.draft, draft: null, history: [] };
            const changed = JSON.parse(JSON.stringify(scheme));
            if (kind === 'name') changed.topics[0].name = 'Renamed';
            if (kind === 'order') changed.topics.reverse();
            if (kind === 'fallback') changed.fallbackTopicId = 'a';
            if (kind === 'valid') changed.topics[0].when = 'New visit price also counts';
            const input = { scheme: changed, expectedDraftRevision: null, expectedBaselineHash: topicSchemeBaseline(p), preserveStructure: true, helpdeskRequestId: 'a'.repeat(32) };
            if (kind !== 'valid') await expect(service.draft(5, '99', false, input)).rejects.toBeInstanceOf(BadRequestException);
            else {
                const next = await service.draft(5, '99', false, input);
                expect(next.active!.scheme).toEqual(scheme);
                expect((next.draft as any).helpdeskRequestId).toBe('a'.repeat(32));
                await expect(service.apply(5, '99', false, next.draft!.revision)).rejects.toBeInstanceOf(BadRequestException);
            }
        }
    });
});
