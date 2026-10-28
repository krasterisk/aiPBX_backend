import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { z } from 'zod';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { TopicSchemeService } from '../operator-analytics/topic-scheme.service';
import { topicSchemeBaseline } from '../operator-analytics/lib/topic-scheme';
import { topicHash } from './analytics-topics';
import { HelpdeskEmailContextService } from './helpdesk-email-context.service';

const scope = z.object({ cabinetId: z.number().int().positive(), projectId: z.number().int().positive(),
    stage: z.enum(['read', 'draft', 'check', 'apply']), input: z.unknown() }).strict();
const draft = z.object({ scheme: z.unknown(), expectedDraftRevision: z.string().uuid().nullable(),
    expectedBaselineHash: z.string().regex(/^[a-f0-9]{64}$/), helpdeskRequestId: z.string().regex(/^[a-f0-9]{32}$/) }).strict();
const check = z.object({ revision: z.string().uuid(), cases: z.array(z.object({
    text: z.string().min(10).max(60000), expectedTopicId: z.string().min(1).max(50),
}).strict()).min(3).max(20) }).strict();
const apply = z.object({ revision: z.string().uuid() }).strict();
const snapshot = (state: any) => ({ active: state.active ?? null, draft: state.draft ? {
    revision: state.draft.revision, baselineHash: state.draft.baselineHash,
    schemeHash: topicHash(state.draft.scheme), checks: state.draft.checks,
    checkRun: state.draft.checkRun ?? null,
    helpdeskRequestId: state.draft.helpdeskRequestId ?? null,
} : null });

@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools')
export class HelpdeskTopicSchemeController {
    constructor(private readonly bound: HelpdeskEmailContextService,
        private readonly schemes: TopicSchemeService,
        @InjectModel(OperatorProject) private readonly projects: typeof OperatorProject) {}

    @Post('bound-topic-scheme')
    async run(@Body() body: unknown, @Req() request: { apiKeyUserId?: number }) {
        const parsed = scope.safeParse(body);
        if (!parsed.success) throw new BadRequestException('Invalid scoped scheme request');
        const dto = parsed.data;
        // The existing bound-context resolver verifies the ADMIN API-key owner
        // and exact cabinet/project relationship before any draft/check/write.
        await this.bound.getBoundSupportContext(request.apiKeyUserId, { cabinetId: dto.cabinetId, projectId: dto.projectId });
        const owner = String(dto.cabinetId), id = dto.projectId;
        let state: unknown;
        if (dto.stage === 'read') {
            if (!dto.input || typeof dto.input !== 'object' || Array.isArray(dto.input) || Object.keys(dto.input).length) throw new BadRequestException('Read input must be empty');
            const project = await this.projects.findOne({ where: { id, userId: owner } });
            if (!project) throw new BadRequestException('Scoped project unavailable');
            return { clientId: owner, projectId: id, contract: 'analytics-scheme-v1',
                baselineHash: topicSchemeBaseline(project), hash: topicHash(project.callTaxonomy ?? []),
                topics: project.callTaxonomy ?? [], state: snapshot(project.topicSchemeState ?? {}) };
        }
        if (dto.stage === 'draft') {
            const input = draft.safeParse(dto.input);
            if (!input.success) throw new BadRequestException('Invalid scoped scheme draft');
            state = await this.schemes.draft(id, owner, false, { ...input.data, preserveStructure: true });
        } else if (dto.stage === 'check') {
            const input = check.safeParse(dto.input);
            if (!input.success) throw new BadRequestException('Invalid labelled scheme checks');
            const result = await this.schemes.check(id, owner, false, input.data);
            state = result.state;
        } else {
            const input = apply.safeParse(dto.input);
            if (!input.success) throw new BadRequestException('Invalid scoped scheme activation');
            state = await this.schemes.apply(id, owner, false, input.data.revision);
        }
        return { clientId: owner, projectId: id, contract: 'analytics-scheme-v1', state: snapshot(state) };
    }
}
