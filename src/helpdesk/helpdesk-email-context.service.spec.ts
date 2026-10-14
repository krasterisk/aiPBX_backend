import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HelpdeskEmailContextService } from './helpdesk-email-context.service';
import { buildDashboardCdrWhere } from '../operator-analytics/lib/dashboard-aggregation';
import { Op } from 'sequelize';

describe('HelpdeskEmailContextService', () => {
    const users = { findByPk: jest.fn(), findAll: jest.fn() };
    const projects = { findAll: jest.fn() };
    const transcripts = { findAll: jest.fn() };
    const calls = { findAll: jest.fn() };
    const assistants = { findAll: jest.fn() };
    const rates = { findOne: jest.fn() };
    const reporting = { getProjectDashboard: jest.fn() };
    let service: HelpdeskEmailContextService;
    const admin = { id: 1, banned: false, isActivated: true, roles: [{ value: 'ADMIN' }] };
    const project = { id: 7, userId: '20', name: 'Sales', webhookHeaders: { Authorization: 'secret' }, callTaxonomy: [{ id: 'topic' }] };
    beforeEach(() => {
        jest.resetAllMocks();
        process.env.TENANT_CURRENCY = 'USD';
        assistants.findAll.mockResolvedValue([{ id: 4, name: 'Reception', apiKey: 'secret' }]);
        service = new HelpdeskEmailContextService(users as never, projects as never, transcripts as never, calls as never, assistants as never, rates as never, reporting as never);
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
    it('support capabilities require explicit scope and never read conversations', async () => {
        const result = await service.getSupportContext(1,{email:'user@example.test',cabinetId:20,projectId:7});
        expect(result).toMatchObject({found:true,clientId:'20',projectId:7,reporting:{patientRegistryConfigured:false}});
        expect(projects.findAll).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'20',id:7}}));
        expect(calls.findAll).not.toHaveBeenCalled();expect(transcripts.findAll).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain('secret');
        users.findByPk.mockResolvedValueOnce(admin);
        await expect(service.getSupportContext(1,{email:'user@example.test',cabinetId:21,projectId:7})).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.getSupportContext(1,{email:'user@example.test'})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns company/domain candidates without granting access or exposing records', async () => {
        users.findAll.mockResolvedValue([{id:21,vpbx_user_id:20,password:'SECRET'}]);
        const result=await service.getIdentityCandidates(1,{company:'Панацея',domain:'clinic.example.test',contactEmail:'support@clinic.example.test'});
        expect(result.confirmed).toBe(false);
        expect(result.requiresOwnerConfirmation).toBe(true);
        expect(result.candidates[0].cabinetId).toBe(20);
        expect(JSON.stringify(result)).not.toContain('SECRET');
        expect(JSON.stringify(result)).not.toContain('transcription');
        expect(transcripts.findAll).not.toHaveBeenCalled();
        expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('rejects broad wildcard selectors and public mail domains alone', async () => {
        await expect(service.getIdentityCandidates(1,{company:'%'})).rejects.toBeInstanceOf(BadRequestException);
        expect(projects.findAll).not.toHaveBeenCalled();
        users.findByPk.mockReset().mockResolvedValue(admin);
        await expect(service.getIdentityCandidates(1,{domain:'mail.ru'})).rejects.toBeInstanceOf(BadRequestException);
        expect(users.findAll).not.toHaveBeenCalled();
    });
    it('requires active admin ownership for candidate enumeration', async () => {
        users.findByPk.mockReset().mockResolvedValue({...admin,roles:[{value:'USER'}]});
        await expect(service.getIdentityCandidates(1,{company:'Clinic'})).rejects.toBeInstanceOf(ForbiddenException);
        expect(users.findAll).not.toHaveBeenCalled();
        expect(projects.findAll).not.toHaveBeenCalled();
    });
    it('reads bound project metadata without requiring the unknown sender email', async () => {
        const result=await service.getBoundSupportContext(1,{cabinetId:20,projectId:7});
        expect(result.clientId).toBe('20');
        expect(result.capabilities.operatorFilter).toBe(true);
        expect(result.reporting.filterFields).toContain('success');
        expect(projects.findAll).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'20',id:7}}));
        expect(users.findAll).not.toHaveBeenCalled();
        expect(transcripts.findAll).not.toHaveBeenCalled();
        expect(calls.findAll).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain('secret');
    });
    it('rejects mismatched bound project and nested cabinet ownership', async () => {
        projects.findAll.mockResolvedValue([]);
        await expect(service.getBoundSupportContext(1,{cabinetId:20,projectId:999})).rejects.toBeInstanceOf(ForbiddenException);
        users.findByPk.mockReset().mockResolvedValueOnce(admin).mockResolvedValue({id:20,banned:false,vpbx_user_id:30});
        await expect(service.getBoundSupportContext(1,{cabinetId:20,projectId:7})).rejects.toBeInstanceOf(ForbiddenException);
    });
    it('distinguishes target topics, conversion success and unusable recording quality', async () => {
        const result=await service.getBoundSupportContext(1,{cabinetId:20,projectId:7});
        expect(result.capabilities.operatorTopicBreakdown).toBe(true);
        expect(result.reporting.guide.concepts.targetCall).toContain('не показатель success');
        expect(result.reporting.guide.qualityExcludedLevels).toEqual(['low','unusable']);
        expect(result.capabilities.perOperatorSuccessRules).toBe(false);
    });
    it('reuses the dashboard as the selected owner, only exposes bounded aggregates', async () => {
        reporting.getProjectDashboard.mockResolvedValue({totalAnalyzed:12,excludedLowQualityCount:2,successRate:60,
            agentScorecards:[{operatorName:'201',callsCount:10,successRate:60,secret:'PRIVATE'}],tagStats:[{tagId:'tag',name:'Appointment',callsCount:8,successRate:50}],
            transcripts:['PRIVATE_PATIENT'],recordings:['PRIVATE_AUDIO'],project:{apiKey:'PRIVATE_KEY'}});
        const result=await service.getReportingSummary(1,{cabinetId:20,projectId:7,periodDays:7,operatorName:'201'});
        expect(reporting.getProjectDashboard).toHaveBeenCalledWith(7,'20',false,expect.objectContaining({operatorName:'201'}));
        expect(result).toMatchObject({aggregatesOnly:true,clientId:'20',projectId:7,totals:{analyzed:12,excludedLowQuality:2},operators:[{name:'201',calls:10}],topics:[{name:'Appointment',calls:8}]});
        expect(JSON.stringify(result)).not.toContain('PRIVATE');
        expect(result.period.days).toBe(7);
        expect(transcripts.findAll).not.toHaveBeenCalled();expect(calls.findAll).not.toHaveBeenCalled();
    });
    it('rejects broad periods and wildcard operator filters before reading the dashboard', async () => {
        for (const value of [{periodDays:365},{periodDays:7,operatorName:'%'}]) {
            users.findByPk.mockReset().mockResolvedValueOnce(admin).mockResolvedValue({id:20,banned:false,vpbx_user_id:null});
            await expect(service.getReportingSummary(1,{cabinetId:20,projectId:7,...value})).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(reporting.getProjectDashboard).not.toHaveBeenCalled();
    });
    it('passes calendar dates through the real dashboard query builder without invalid SQL dates', async () => {
        reporting.getProjectDashboard.mockImplementation(async (projectId,userId,isAdmin,query) => {
            const where=buildDashboardCdrWhere({...query,projectId},isAdmin,userId,(v)=>({[Op.like]:v}));
            const dates=where.createdAt[Op.between] as Date[];
            expect(dates).toHaveLength(2);
            for(const d of dates) expect(Number.isFinite(d.getTime())).toBe(true);
            expect(query.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(query.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(where.userId).toBe('20');expect(where.projectId).toBe(7);
            return {totalAnalyzed:0,agentScorecards:[],tagStats:[]};
        });
        const result=await service.getReportingSummary(1,{cabinetId:20,projectId:7,periodDays:14});
        expect(result.period.timeBasis).toBe('reporting_server_calendar');
        expect(result.period.timeZone).toBeTruthy();
    });
    it('does not read reporting data for a foreign project or non-admin key owner', async () => {
        projects.findAll.mockResolvedValue([]);
        await expect(service.getReportingSummary(1,{cabinetId:20,projectId:99})).rejects.toBeInstanceOf(ForbiddenException);
        users.findByPk.mockReset().mockResolvedValue({...admin,roles:[{value:'USER'}]});
        await expect(service.getReportingSummary(1,{cabinetId:20,projectId:7})).rejects.toBeInstanceOf(ForbiddenException);
        expect(reporting.getProjectDashboard).not.toHaveBeenCalled();
    });
    it('explicitly marks truncated lists while preserving existing aggregate values', async () => {
        reporting.getProjectDashboard.mockResolvedValue({totalAnalyzed:100,successRate:70,agentScorecards:Array.from({length:35},(_,i)=>({operatorName:String(i),callsCount:2,successRate:50})),tagStats:[]});
        const result=await service.getReportingSummary(1,{cabinetId:20,projectId:7});
        expect(result.truncated).toBe(true);expect(result.operators).toHaveLength(30);expect(result.totals.analyzed).toBe(100);
    });

});
