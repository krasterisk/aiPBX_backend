import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, where } from 'sequelize';
import { User } from '../users/users.model';
import { Role } from '../roles/roles.model';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { OperatorAnalytics } from '../operator-analytics/operator-analytics.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { HelpdeskEmailContextDto } from './dto/helpdesk-email-context.dto';

@Injectable()
export class HelpdeskEmailContextService {
    private readonly logger = new Logger(HelpdeskEmailContextService.name);

    constructor(
        @InjectModel(User) private readonly users: typeof User,
        @InjectModel(OperatorProject) private readonly projects: typeof OperatorProject,
        @InjectModel(OperatorAnalytics) private readonly transcripts: typeof OperatorAnalytics,
        @InjectModel(AiCdr) private readonly calls: typeof AiCdr,
    ) {}

    async getContext(actorId: number | undefined, dto: HelpdeskEmailContextDto) {
        // Scope alone must never let a regular customer's key enumerate other cabinets.
        if (!actorId) throw new ForbiddenException('ADMIN-owned API key required');
        const actor = await this.users.findByPk(actorId, {
            attributes: ['id', 'banned', 'isActivated'],
            include: [{ model: Role, attributes: ['value'], through: { attributes: [] } }],
        });
        if (!actor || actor.banned || !actor.isActivated || !actor.roles?.some(role => role.value === 'ADMIN')) {
            throw new ForbiddenException('Active ADMIN-owned API key required');
        }
        const sender = dto?.email?.trim().toLowerCase();
        if (!sender || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender) || sender.length > 254) {
            throw new BadRequestException('Valid email required');
        }
        if (dto.projectId != null && (!Number.isSafeInteger(dto.projectId) || dto.projectId <= 0)) {
            throw new BadRequestException('Positive integer projectId required');
        }
        const accounts = await this.users.findAll({
            where: where(fn('LOWER', fn('TRIM', col('email'))), sender),
            attributes: ['id', 'email', 'vpbx_user_id', 'banned'],
            limit: 2,
        });
        if (accounts.length !== 1) {
            return { found: false, ambiguous: accounts.length > 1, reason: accounts.length ? 'multiple_accounts' : 'unknown_email' };
        }
        const account = accounts[0];
        if (account.banned) return { found: false, ambiguous: false, reason: 'account_unavailable' };
        const ownerId = account.vpbx_user_id ?? account.id;
        const owner = await this.users.findByPk(ownerId, { attributes: ['id', 'vpbx_user_id', 'banned'] });
        // Reject broken/nested ownership rather than broadening a tenant query.
        if (!owner || owner.banned || owner.vpbx_user_id != null) {
            return { found: false, ambiguous: false, reason: 'cabinet_unavailable' };
        }
        const clientId = String(ownerId);
        const projectRows = await this.projects.findAll({
            where: { userId: clientId, ...(dto.projectId != null ? { id: dto.projectId } : {}) },
            attributes: ['id', 'userId', 'name', 'description', 'systemPrompt', 'successPrompt', 'customMetricsSchema', 'callTaxonomy', 'currentSchemaVersion'],
            order: [['id', 'ASC']],
            limit: 2,
        });
        if (projectRows.length !== 1) {
            return {
                found: false,
                ambiguous: projectRows.length > 1,
                clientId,
                reason: projectRows.length ? 'multiple_projects' : 'project_not_found',
                projects: projectRows.map(project => ({ id: project.id, name: project.name })),
            };
        }
        const project = projectRows[0];
        const scope = { userId: clientId, projectId: project.id };
        const [transcripts, calls] = await Promise.all([
            this.transcripts.findAll({
                where: scope,
                attributes: ['id', 'transcription', 'status', 'createdAt'],
                order: [['createdAt', 'DESC']], limit: 3,
            }),
            this.calls.findAll({
                where: scope,
                attributes: ['channelId', 'createdAt'],
                include: [{ model: AiAnalytics, attributes: ['summary', 'metrics', 'sentiment', 'csat'] }],
                order: [['createdAt', 'DESC']], limit: 5,
            }),
        ]);
        this.logger.log(`email_context_read actor=${actorId} cabinet=${clientId} project=${project.id}`);
        return {
            found: true,
            ambiguous: false,
            clientId,
            projectId: project.id,
            project: {
                id: project.id, name: project.name, description: project.description,
                systemPrompt: project.systemPrompt, successPrompt: project.successPrompt,
                customMetricsSchema: project.customMetricsSchema, schemaVersion: project.currentSchemaVersion,
            },
            topics: project.callTaxonomy ?? [],
            transcripts: transcripts.map(record => ({
                id: record.id, createdAt: record.get('createdAt'), status: record.status,
                text: record.transcription?.slice(0, 8000) ?? null,
            })),
            analysis: calls.map(call => ({
                channelId: call.channelId, createdAt: call.get('createdAt'),
                summary: call.analytics?.summary?.slice(0, 4000) ?? null,
                sentiment: call.analytics?.sentiment ?? null, csat: call.analytics?.csat ?? null,
                metrics: call.analytics?.metrics ?? null,
            })),
        };
    }
}
