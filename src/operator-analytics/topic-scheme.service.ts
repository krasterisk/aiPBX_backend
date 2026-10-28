import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { OperatorProject } from './operator-project.model';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { assertTopicSchemeChecks, topicSchemeBaseline, topicSchemeTaxonomy, TopicSchemeState, validateTopicScheme } from './lib/topic-scheme';

const draftInput = z.object({
    scheme: z.unknown(), expectedDraftRevision: z.string().uuid().nullable(),
    businessContext: z.string().max(60000).nullable().optional(),
    expectedBaselineHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    preserveStructure: z.literal(true).optional(),
    helpdeskRequestId: z.string().regex(/^[a-f0-9]{32}$/).optional(),
}).strict();
const checkInput = z.object({
    revision: z.string().uuid(),
    cases: z.array(z.object({ text: z.string().min(10).max(60000), expectedTopicId: z.string().min(1).max(50).optional() }).strict()).min(1).max(100),
}).strict();

@Injectable()
export class TopicSchemeService {
    constructor(@InjectModel(OperatorProject) private readonly projects: typeof OperatorProject,
        private readonly analytics: OperatorAnalyticsService) {}

    private async project(id: number, owner: string, admin: boolean, options: any = {}) {
        if (!owner || !Number.isSafeInteger(id) || id <= 0) throw new NotFoundException();
        const project = await this.projects.findOne({ ...options, where: admin ? { id } : { id, userId: owner } });
        if (!project) throw new NotFoundException();
        return project;
    }

    private state(project: OperatorProject): TopicSchemeState {
        return project.topicSchemeState ?? { active: null, draft: null, history: [] };
    }

    private async locked<T>(id: number, owner: string, admin: boolean, work: (p: OperatorProject) => Promise<T>) {
        return this.projects.sequelize.transaction(async transaction => {
            const project = await this.project(id, owner, admin, { transaction, lock: transaction.LOCK.UPDATE });
            const result = await work(project);
            await project.save({ transaction });
            return result;
        });
    }

    async read(id: number, owner: string, admin: boolean) {
        return this.state(await this.project(id, owner, admin));
    }

    async draft(id: number, owner: string, admin: boolean, body: unknown) {
        const input = this.parse(draftInput, body);
        return this.locked(id, owner, admin, async project => {
            const state = this.state(project);
            if (input.expectedBaselineHash && input.expectedBaselineHash !== topicSchemeBaseline(project)) throw new ConflictException('Project changed; reload before saving');
            if ((state.draft?.revision ?? null) !== input.expectedDraftRevision) throw new ConflictException('Draft changed; reload before saving');
            let scheme;
            try { scheme = validateTopicScheme(input.scheme, project.callTaxonomy, false); }
            catch { throw new BadRequestException('Invalid topic scheme or unknown topics'); }
            if (input.preserveStructure) {
                const active = state.active?.scheme;
                if (!input.expectedBaselineHash || !active || scheme.fallbackTopicId !== active.fallbackTopicId
                    || scheme.topics.length !== active.topics.length
                    || scheme.topics.some((t, i) => t.id !== active.topics[i].id || t.name !== active.topics[i].name)) {
                    throw new BadRequestException('Scoped edit must preserve topic identities, names, order and fallback');
                }
            }
            const draft = { revision: randomUUID(), scheme, checks: [], createdAt: new Date().toISOString(), baselineHash: topicSchemeBaseline(project),
                ...(input.helpdeskRequestId ? { helpdeskRequestId: input.helpdeskRequestId } : {}),
                ...(input.businessContext !== undefined ? { businessContext: input.businessContext } : {}) };
            project.topicSchemeState = { ...state, draft };
            return project.topicSchemeState;
        });
    }

    async check(id: number, owner: string, admin: boolean, body: unknown) {
        const input = this.parse(checkInput, body);
        const project = await this.project(id, owner, admin);
        const state = this.state(project), draft = state.draft;
        if (!draft || draft.revision !== input.revision || draft.baselineHash !== topicSchemeBaseline(project)) throw new ConflictException('Draft or project changed');
        if (input.cases.some(c => c.expectedTopicId && !draft.scheme.topics.some(t => t.id === c.expectedTopicId))) throw new BadRequestException('Unknown expected topic');
        const runId = randomUUID();
        await this.locked(id, owner, admin, async fresh => {
            const current = this.state(fresh);
            if (current.draft?.revision !== draft.revision || topicSchemeBaseline(fresh) !== draft.baselineHash
                || current.draft.checkRun?.status === 'running') throw new ConflictException('Draft changed or check already running');
            fresh.topicSchemeState = { ...current, draft: { ...current.draft, checkRun: { id: runId, status: 'running' } } };
        });
        const snapshot = { ...project.get({ plain: true }), callTaxonomy: topicSchemeTaxonomy(draft.scheme, project.callTaxonomy),
            ...(draft.businessContext !== undefined ? { systemPrompt: draft.businessContext } : {}),
            topicSchemeState: { ...state, active: draft } } as OperatorProject;
        const results: any[] = new Array(input.cases.length);
        let cursor = 0;
        const worker = async () => {
            while (cursor < input.cases.length) {
                const index = cursor++, test = input.cases[index];
                const result = await this.analytics.previewTopicScheme(test.text, snapshot);
                results[index] = { ...result, inputHash: createHash('sha256').update(test.text).digest('hex'),
                    expectedTopicId: test.expectedTopicId, selectedTopicId: result.topicIds[0], checkedAt: new Date().toISOString() };
            }
        };
        const workers = await Promise.allSettled(Array.from({ length: Math.min(2, input.cases.length) }, worker));
        if (workers.some(w => w.status === 'rejected')) {
            await this.locked(id, owner, admin, async fresh => {
                const current = this.state(fresh);
                if (current.draft?.revision === draft.revision && current.draft.checkRun?.id === runId) {
                    fresh.topicSchemeState = { ...current, draft: { ...current.draft, checkRun: { id: runId, status: 'failed' } } };
                }
            });
            throw new BadRequestException('Analysis check failed; draft was not applied');
        }
        const updated = await this.locked(id, owner, admin, async fresh => {
            const current = this.state(fresh);
            if (current.draft?.revision !== draft.revision || topicSchemeBaseline(fresh) !== draft.baselineHash) throw new ConflictException('Draft changed while testing');
            // No transcript, quotes or patient data are stored in draft/history.
            const checks = results.map(({ inputHash, expectedTopicId, selectedTopicId, model, checkedAt }) => ({ inputHash, expectedTopicId, selectedTopicId, model, checkedAt }));
            if (current.draft.checks.length + checks.length > 500) throw new BadRequestException('Create a new draft before more checks');
            fresh.topicSchemeState = { ...current, draft: { ...current.draft, checks: [...current.draft.checks, ...checks],
                checkRun: { id: runId, status: 'passed' } } };
            return fresh.topicSchemeState;
        });
        return { state: updated, results };
    }

    async apply(id: number, owner: string, admin: boolean, revision: string) {
        return this.locked(id, owner, admin, async project => {
            const state = this.state(project), draft = state.draft;
            if (!draft || draft.revision !== revision || topicSchemeBaseline(project) !== draft.baselineHash) throw new ConflictException('Draft or project changed');
            validateTopicScheme(draft.scheme, project.callTaxonomy, false);
            try { assertTopicSchemeChecks(draft); } catch { throw new BadRequestException('All labelled checks must pass, covering every topic'); }
            const active = { ...draft, createdAt: new Date().toISOString() };
            project.topicSchemeState = { active, draft: null, history: [...state.history, active].slice(-20) };
            project.callTaxonomy = topicSchemeTaxonomy(draft.scheme, project.callTaxonomy);
            project.singleTopic = true;
            if (draft.businessContext !== undefined) project.systemPrompt = draft.businessContext;
            return project.topicSchemeState;
        });
    }

    private parse<T>(schema: z.ZodType<T>, value: unknown): T {
        const result = schema.safeParse(value);
        if (!result.success) throw new BadRequestException('Invalid topic scheme request');
        return result.data;
    }
}
