import { BadRequestException, ForbiddenException, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { col, fn, where, Op } from 'sequelize';
import { User } from '../users/users.model';
import { Role } from '../roles/roles.model';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { OperatorAnalytics } from '../operator-analytics/operator-analytics.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { Assistant } from '../assistants/assistants.model';
import { Rates } from '../currency/rates.model';
import { getTenantCurrency } from '../shared/tenant/tenant-currency';
import { HelpdeskEmailContextDto, HelpdeskIdentityCandidatesDto, HelpdeskBoundSupportDto, HelpdeskReportingSummaryDto } from './dto/helpdesk-email-context.dto';
import { OperatorAnalyticsService } from '../operator-analytics/operator-analytics.service';
import { compileTopicEdit, topicHash, TOPICS_CONTRACT } from './analytics-topics';
import { HelpdeskTopicEditDto } from './dto/helpdesk-email-context.dto';

const REPORTING_GUIDE={
    concepts:{targetCall:'Тема обращения по настроенной классификации, не показатель success',success:'Результат разговора/конверсия по общей настройке проекта',lowQuality:'Низкое/непригодное качество распознавания; исключение из агрегатов не означает нецелевое обращение'},
    navigation:['Речевая аналитика → нужный проект → период','Таблица операторов: количество звонков и процент успешных','Выберите оператора, затем нужную тему обращения, чтобы увидеть соответствующие звонки'],
    operatorTopicBreakdown:true,topicFiltering:true,qualityExcludedLevels:['low','unusable'],
};

@Injectable()
export class HelpdeskEmailContextService {
    private readonly logger = new Logger(HelpdeskEmailContextService.name);

    constructor(
        @InjectModel(User) private readonly users: typeof User,
        @InjectModel(OperatorProject) private readonly projects: typeof OperatorProject,
        @InjectModel(OperatorAnalytics) private readonly transcripts: typeof OperatorAnalytics,
        @InjectModel(AiCdr) private readonly calls: typeof AiCdr,
        @InjectModel(Assistant) private readonly assistants: typeof Assistant,
        @InjectModel(Rates) private readonly rates: typeof Rates,
        @Optional() private readonly reporting?: OperatorAnalyticsService,
    ) {}

    async getContext(actorId: number | undefined, dto: HelpdeskEmailContextDto) {
        const resolved = await this.resolveProject(actorId,dto);
        if (!resolved.found) return {found:false as const,ambiguous:resolved.ambiguous,reason:resolved.reason,clientId:resolved.clientId,projects:resolved.projects};
        const { owner, clientId, project } = resolved;
        if (dto.scope === 'cabinet') return this.cabinetContext(actorId!, owner);
        if (!project) throw new BadRequestException('Project required');
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
            contextScope: 'project' as const,
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

    private async requireAdmin(actorId: number | undefined) {
        // Scope alone must never let a regular customer's key enumerate other cabinets.
        if (!actorId) throw new ForbiddenException('ADMIN-owned API key required');
        const actor = await this.users.findByPk(actorId, {
            attributes: ['id', 'banned', 'isActivated'],
            include: [{ model: Role, attributes: ['value'], through: { attributes: [] } }],
        });
        if (!actor || actor.banned || !actor.isActivated || !actor.roles?.some(role => role.value === 'ADMIN')) {
            throw new ForbiddenException('Active ADMIN-owned API key required');
        }
    }

    private async resolveProject(actorId: number | undefined, dto: HelpdeskEmailContextDto) {
        await this.requireAdmin(actorId);
        const sender = dto?.email?.trim().toLowerCase();
        if (!sender || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender) || sender.length > 254) {
            throw new BadRequestException('Valid email required');
        }
        if (dto.cabinetId != null && (!Number.isSafeInteger(dto.cabinetId) || dto.cabinetId <= 0)) throw new BadRequestException('Positive integer cabinetId required');
        if (dto.projectId != null && (!Number.isSafeInteger(dto.projectId) || dto.projectId <= 0)) {
            throw new BadRequestException('Positive integer projectId required');
        }
        if (dto.scope != null && !['cabinet', 'analytics'].includes(dto.scope)) throw new BadRequestException('Invalid context scope');
        const accounts = await this.users.findAll({
            where: where(fn('LOWER', fn('TRIM', col('email'))), sender),
            attributes: ['id', 'email', 'vpbx_user_id', 'banned'],
            limit: 2,
        });
        if (accounts.length !== 1) {
            return { found: false as const, ambiguous: accounts.length > 1, reason: accounts.length ? 'multiple_accounts' : 'unknown_email' };
        }
        const account = accounts[0];
        if (account.banned) return { found: false as const, ambiguous: false, reason: 'account_unavailable' };
        const ownerId = account.vpbx_user_id ?? account.id;
        const owner = await this.users.findByPk(ownerId, { attributes: ['id', 'vpbx_user_id', 'banned', 'balance'] });
        // Reject broken/nested ownership rather than broadening a tenant query.
        if (!owner || owner.banned || owner.vpbx_user_id != null) {
            return { found: false as const, ambiguous: false, reason: 'cabinet_unavailable' };
        }
        const clientId = String(ownerId);
        if (dto.cabinetId != null && dto.cabinetId !== ownerId) throw new ForbiddenException('Configured cabinet mismatch');
        if (dto.scope === 'cabinet') return { found: true as const, owner, clientId, project: null };
        const projectRows = await this.projects.findAll({
            where: { userId: clientId, ...(dto.projectId != null ? { id: dto.projectId } : {}) },
            attributes: ['id', 'userId', 'name', 'description', 'systemPrompt', 'successPrompt', 'customMetricsSchema', 'callTaxonomy', 'currentSchemaVersion'],
            order: [['id', 'ASC']],
            limit: 2,
        });
        if (projectRows.length !== 1) {
            return {
                found: false as const,
                ambiguous: projectRows.length > 1,
                clientId,
                reason: projectRows.length ? 'multiple_projects' : 'project_not_found',
                projects: projectRows.map(project => ({ id: project.id, name: project.name })),
            };
        }
        const project = projectRows[0];
        return { found: true as const, owner, clientId, project };
    }

    async getSupportContext(actorId: number | undefined, dto: HelpdeskEmailContextDto) {
        if (!dto.cabinetId || !dto.projectId || dto.scope === 'cabinet') throw new BadRequestException('Explicit cabinet and project required');
        const resolved = await this.resolveProject(actorId,{...dto,scope:'analytics'});
        if (!resolved.found) return {found:false as const,ambiguous:resolved.ambiguous,reason:resolved.reason,clientId:resolved.clientId,projects:resolved.projects};
        const project = resolved.project!;
        return {
            found:true, product:'aipbx', clientId:resolved.clientId, projectId:project.id,
            capabilities:{transcription:true,controlledTopicVocabulary:true,customMetrics:true,
                dailyUniquePatientReport:'requires_report_verification',primaryRepeatPatients:'requires_patient_registry'},
            reporting:{schemaVersion:project.currentSchemaVersion,metricsSchema:project.customMetricsSchema??[],callTaxonomy:project.callTaxonomy??[],
                patientRegistryConfigured:false,identityRule:'Repeated calls do not establish patient status'},
        };
    }

    async getIdentityCandidates(actorId: number | undefined, dto: HelpdeskIdentityCandidatesDto) {
        await this.requireAdmin(actorId);
        const conditions: any[] = [];
        const email=dto?.contactEmail?.trim().toLowerCase();
        const domain=dto?.domain?.trim().toLowerCase();
        const company=dto?.company?.trim().toLowerCase();
        if (email) {
            if (email.length>254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) throw new BadRequestException('Invalid contact');
            conditions.push(where(fn('LOWER',fn('TRIM',col('email'))),email));
        }
        // Common mail providers cannot identify a company. A match still needs owner confirmation.
        const publicDomains=new Set(['gmail.com','mail.ru','yandex.ru','ya.ru','outlook.com','hotmail.com','bk.ru','list.ru','inbox.ru']);
        if (domain) {
            if (domain.length>253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new BadRequestException('Invalid domain');
            if (!publicDomains.has(domain)) conditions.push(where(fn('LOWER',fn('TRIM',col('email'))),{[Op.like]:'%@'+domain}));
        }
        if (company) {
            if (company.length<2 || company.length>120 || !/^[\p{L}\p{N} .()-]+$/u.test(company)) throw new BadRequestException('Invalid company name');
            conditions.push(where(fn('LOWER',col('name')),{[Op.like]:'%'+company+'%'}),where(fn('LOWER',col('username')),{[Op.like]:'%'+company+'%'}));
        }
        if (!conditions.length) throw new BadRequestException('Contact, company or company domain required');
        const [accounts,projectMatches]=await Promise.all([
            this.users.findAll({where:{[Op.or]:conditions,banned:false},attributes:['id','name','username','vpbx_user_id'],order:[['id','ASC']],limit:11}),
            company ? this.projects.findAll({where:where(fn('LOWER',col('name')),{[Op.like]:'%'+company+'%'}),attributes:['userId'],order:[['id','ASC']],limit:11}) : Promise.resolve([]),
        ]);
        const ids=[...new Set([...accounts.map(a=>Number(a.vpbx_user_id??a.id)),...projectMatches.map(p=>Number(p.userId))])].filter(id=>Number.isSafeInteger(id)&&id>0);
        const candidates: Array<{cabinetId:number;name:string;projects:Array<{id:number;name:string}>;projectsTruncated:boolean}> = [];
        for (const id of ids.slice(0,5)) {
            const owner=await this.users.findByPk(id,{attributes:['id','name','username','banned','vpbx_user_id']});
            if (!owner || owner.banned || owner.vpbx_user_id!=null) continue;
            const rows=await this.projects.findAll({where:{userId:String(id)},attributes:['id','name'],order:[['id','ASC']],limit:11});
            candidates.push({cabinetId:id,name:(owner.name||owner.username||'').slice(0,120),projects:rows.slice(0,10).map(p=>({id:p.id,name:p.name?.slice(0,120)||''})),projectsTruncated:rows.length>10});
        }
        return {confirmed:false,requiresOwnerConfirmation:true,ambiguous:candidates.length>1,candidates,truncated:ids.length>5||accounts.length>10||projectMatches.length>10};
    }

    async getTopicSettings(actorId:number|undefined,dto:HelpdeskBoundSupportDto) {
        const context = await this.getBoundSupportContext(actorId,dto);
        const topics = context.reporting.callTaxonomy;
        return {clientId:context.clientId,projectId:context.projectId,contract:TOPICS_CONTRACT,
            topics,hash:topicHash(topics),historicalReanalysis:false};
    }

    async editTopics(actorId:number|undefined,dto:HelpdeskTopicEditDto) {
        // The authenticated helpdesk executor owns the durable exact human approval
        // and effect intent. Model tools never receive an apply endpoint.
        await this.getBoundSupportContext(actorId,dto);
        if (!dto || !/^[a-f0-9]{64}$/.test(dto.after_hash) || !/^[a-f0-9]{32}$/.test(dto.execution_id)
            || Object.keys(dto).some(k=>!['cabinetId','projectId','edit','after_hash','execution_id'].includes(k))) throw new BadRequestException('Invalid topic execution');
        if (!this.projects.sequelize) throw new ServiceUnavailableException('Topic transaction unavailable');
        const result = await this.projects.sequelize.transaction(async transaction => {
            const project = await this.projects.findOne({where:{id:dto.projectId,userId:String(dto.cabinetId)},transaction,lock:transaction.LOCK.UPDATE});
            if (!project) throw new ForbiddenException('Project outside selected cabinet');
            const current = project.callTaxonomy ?? [];
            if (topicHash(current) === dto.after_hash) return {changed:false,topics:current};
            const topics = compileTopicEdit(current,dto.edit);
            if (topicHash(topics) !== dto.after_hash) throw new BadRequestException('Approved result hash mismatch');
            project.callTaxonomy = topics;
            await project.save({fields:['callTaxonomy'],transaction});
            return {changed:true,topics};
        });
        this.logger.log(`topic_edit actor=${actorId} cabinet=${dto.cabinetId} project=${dto.projectId} execution=${dto.execution_id} changed=${result.changed}`);
        return {clientId:String(dto.cabinetId),projectId:dto.projectId,contract:TOPICS_CONTRACT,
            hash:topicHash(result.topics),changed:result.changed,status:'applied',historicalReanalysis:false};
    }

    async getBoundSupportContext(actorId:number|undefined,dto:HelpdeskBoundSupportDto) {
        await this.requireAdmin(actorId);
        if (!Number.isSafeInteger(dto?.cabinetId)||dto.cabinetId<=0||!Number.isSafeInteger(dto?.projectId)||dto.projectId<=0) throw new BadRequestException('Explicit cabinet and project required');
        const owner=await this.users.findByPk(dto.cabinetId,{attributes:['id','banned','vpbx_user_id']});
        if (!owner||owner.banned||owner.vpbx_user_id!=null) throw new ForbiddenException('Cabinet unavailable');
        const rows=await this.projects.findAll({where:{userId:String(dto.cabinetId),id:dto.projectId},attributes:['id','name','successPrompt','customMetricsSchema','callTaxonomy','currentSchemaVersion'],limit:2});
        if (rows.length!==1) throw new ForbiddenException('Project outside selected cabinet');
        const project=rows[0];
        return {found:true,product:'aipbx',clientId:String(dto.cabinetId),projectId:project.id,
            capabilities:{operatorFilter:true,successFilter:true,projectDashboard:true,perOperatorSuccessRules:false,operatorTopicBreakdown:true,topicFilter:true,recordingQualityExclusion:true},
            reporting:{schemaVersion:project.currentSchemaVersion,metricsSchema:project.customMetricsSchema??[],callTaxonomy:project.callTaxonomy??[],successRule:project.successPrompt??null,
                filterFields:['operatorNameExact','success','projectId','startDate','endDate'],successRuleScope:'project',patientRegistryConfigured:false,guide:REPORTING_GUIDE}};
    }

    async getReportingSummary(actorId:number|undefined,dto:HelpdeskReportingSummaryDto) {
        const context=await this.getBoundSupportContext(actorId,dto);
        const period=dto.periodDays??14;
        if (![7,14,30].includes(period)||!Number.isInteger(period)||
            (dto.operatorName!==undefined&&(typeof dto.operatorName!=='string'||!/^[\p{L}\p{N}_ .()\/+-]{1,80}$/u.test(dto.operatorName)))) throw new BadRequestException('Invalid reporting period or operator filter');
        if (!this.reporting) throw new ServiceUnavailableException('Reporting adapter unavailable');
        // Existing dashboard accepts calendar dates and expands them in the server timezone.
        const end=new Date();const start=new Date(end);start.setDate(start.getDate()-period+1);
        const calendarDate=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
        const startDate=calendarDate(start);const endDate=calendarDate(end);
        // Reuse the actual dashboard, forced to the verified owner/project, not the key's admin scope.
        // This read does not call insights, analysis, transcription or other paid providers.
        const query={startDate,endDate,...(dto.operatorName?{operatorNameExact:dto.operatorName}:{})};
        const data=await this.reporting.getProjectDashboard(dto.projectId,String(dto.cabinetId),false,query);
        const agents=data.agentScorecards??[];const topics=data.tagStats??[];
        return {found:true,clientId:context.clientId,projectId:context.projectId,aggregatesOnly:true,
            period:{days:period,start:startDate,end:endDate,timeBasis:'reporting_server_calendar',timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},operatorFilter:dto.operatorName??null,operatorFilterMode:dto.operatorName?'exact':null,
            totals:{analyzed:data.totalAnalyzed,excludedLowQuality:data.excludedLowQualityCount??0,successRate:data.successRate},
            operators:agents.slice(0,30).map(a=>({name:a.operatorName,calls:a.callsCount,successRate:a.successRate})),
            topics:topics.slice(0,50).map(t=>({id:t.tagId,name:t.name,calls:t.callsCount,successRate:t.successRate})),
            truncated:agents.length>30||topics.length>50,guide:REPORTING_GUIDE};
    }

    private async cabinetContext(actorId: number, owner: User) {
        const currency = getTenantCurrency();
        const balanceUsd = owner.balance == null ? NaN : Number(owner.balance);
        let rate: number | null = currency === 'USD' ? 1 : null;
        if (currency !== 'USD') {
            const [local, usd] = await Promise.all([
                this.rates.findOne({ where: { currency }, attributes: ['rate'] }),
                this.rates.findOne({ where: { currency: 'USD' }, attributes: ['rate'] }),
            ]);
            if (Number(local?.rate) > 0 && Number(usd?.rate) > 0) {
                const ratio = Number(local.rate) / Number(usd.rate);
                if (Number.isFinite(ratio) && ratio > 0) rate = ratio;
            }
        }
        const available = Number.isFinite(balanceUsd) && rate != null;
        const rows = await this.assistants.findAll({
            where: { userId: owner.id },
            attributes: ['id', 'name', 'model', 'voice', 'pipelineMode', 'llmProvider', 'llmModel', 'ttsProvider', 'ttsVoice', 'analytic'],
            order: [['id', 'ASC']], limit: 51,
        });
        this.logger.log(`cabinet_context_read actor=${actorId} cabinet=${owner.id}`);
        return {
            found: true, ambiguous: false, clientId: String(owner.id),
            contextScope: 'cabinet' as const, projectId: null, project: null,
            balance: { amount: available ? Math.round(balanceUsd * rate * 100) / 100 : null, currency, available, asOf: new Date().toISOString() },
            assistants: rows.slice(0, 50).map(assistant => ({
                id: assistant.id, name: assistant.name, model: assistant.model, voice: assistant.voice,
                pipelineMode: assistant.pipelineMode, llmProvider: assistant.llmProvider, llmModel: assistant.llmModel,
                ttsProvider: assistant.ttsProvider, ttsVoice: assistant.ttsVoice, analyticsEnabled: assistant.analytic,
            })),
            assistantsTruncated: rows.length > 50,
            assistantLiveStatusVerified: false,
            topics: [], transcripts: [], analysis: [],
        };
    }
}
