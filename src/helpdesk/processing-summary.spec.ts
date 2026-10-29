import { ForbiddenException } from '@nestjs/common';
import { HelpdeskProcessingController } from './helpdesk-processing.controller';
import { processingPeriod, readProcessingSummary } from './processing-summary';

describe('bounded processing metadata',()=>{
    const now=new Date('2026-10-29T00:15:00Z');
    it('uses the requested local calendar and defaults to yesterday/today',()=>{
        expect(processingPeriod(undefined,'Asia/Krasnoyarsk',now)).toMatchObject({start:'2026-10-28',end:'2026-10-29',endExclusive:'2026-10-30',partialLastDay:true,days:2});
        expect(processingPeriod(undefined,'America/Los_Angeles',now).end).toBe('2026-10-28');
    });
    it.each(['2026-02-30/2026-03-01','2026-10-29/2026-10-28','2026-09-01/2026-10-29','2026-10-29/2026-10-30','SELECT/1','2026-01-01','2026-10-28/2026-10-29 x'])('rejects invalid period %s',p=>expect(()=>processingPeriod(p,'UTC',now)).toThrow());
    it('rejects invalid timezones',()=>expect(()=>processingPeriod(undefined,"UTC';DELETE",now)).toThrow());
    it('accepts exactly 31 days',()=>expect(processingPeriod('2026-09-29/2026-10-29','UTC',now).days).toBe(31));

    function database({sampleCalls=20,localCalls=20,tariff=true,rub=true}={}) {
        const query=jest.fn(async(sql:string,_options?:unknown)=>{
            if(sql.includes('GROUP BY'))return [{day:'2026-10-28',submittedRecords:15,completed:3,balanceErrors:10,otherErrors:1,processing:1}];
            if(sql.includes('distinctRecordings'))return [{records:10,distinctRecordings:9,recordingLinks:10,knownDurations:0,knownSeconds:null,withTranscript:0}];
            if(sql.includes('SELECT balance'))return [{balance:3}];
            if(sql.includes('FROM prices'))return tariff?[{analytic:5,stt:0.1}]:[];
            if(sql.includes('FROM rates'))return rub?[{currency:'USD',rate:1},{currency:'RUB',rate:80}]:[];
            return [{calls:sampleCalls,averageTokens:6000,averageSeconds:100,tokensPerSecond:60,localWhisperCalls:localCalls}];
        });return {query};
    }
    it('separates counts and returns a labelled estimate, not a paid operation',async()=>{
        const db=database();const result=await readProcessingSummary(db as never,20,7,processingPeriod('2026-10-28/2026-10-29','Asia/Krasnoyarsk',now),'RUB');
        expect(result.daily[0]).toMatchObject({balanceErrors:10,otherErrors:1,processing:1});
        expect(result.missedForBalance).toMatchObject({records:10,distinctRecordings:9});
        expect(result.estimate).toMatchObject({available:true,amount:24,amountUsd:0.3,currency:'RUB',requiresCustomerConsent:true,assumedSttProvider:'whisper'});
        expect(result.tariff).toMatchObject({analysisPerMillionTokens:5,externalSttPerMinute:0.1,localWhisperSttPerMinute:0});
        for(const [sql,options]of db.query.mock.calls){expect(sql.trim()).toMatch(/^SELECT/);expect(options).toMatchObject({replacements:{owner:'20',project:7,start:'2026-10-28',until:'2026-10-30',tz:'Asia/Krasnoyarsk'}})}
        expect(JSON.stringify(result)).not.toMatch(/recordUrl|clientPhone|filename/);
    });
    it.each([{sampleCalls:9},{localCalls:10},{tariff:false},{rub:false}])('does not invent a price from incomplete facts %s',async options=>{
        const result=await readProcessingSummary(database(options)as never,20,7,processingPeriod(undefined,'UTC',now),'RUB');
        expect(result.estimate).toMatchObject({available:false,amount:null});
    });
    it('uses parameters for both cabinet and project in the database reads',async()=>{
        const db=database();await readProcessingSummary(db as never,20,7,processingPeriod(undefined,'UTC',now),'USD');
        const sampleSql=db.query.mock.calls.at(-1)![0];expect(sampleSql).toContain('o."userId"=:owner AND o."projectId"=:project');expect(sampleSql).toContain('o."schemaVersion"');
    });
});

describe('processing read authority',()=>{
    const admin={banned:false,isActivated:true,roles:[{value:'ADMIN'}]};
    const owner={id:20,banned:false,vpbx_user_id:null};
    function setup(actor:any=admin,account:any=owner,project:any={id:7}){
        const users={findByPk:jest.fn().mockResolvedValueOnce(actor).mockResolvedValue(account)};
        const projects={findOne:jest.fn().mockResolvedValue(project),sequelize:{query:jest.fn()}};
        return {users,projects,controller:new HelpdeskProcessingController(users as never,projects as never)};
    }
    it('rejects missing credentials before account reads',async()=>{
        const s=setup();await expect(s.controller.summary({cabinetId:20,projectId:7},{})).rejects.toThrow(ForbiddenException);expect(s.users.findByPk).not.toHaveBeenCalled();
    });
    it.each([null,{...admin,banned:true},{...admin,isActivated:false},{...admin,roles:[{value:'USER'}]}])('refuses non-admin key owner %s',async actor=>{
        const s=setup(actor);await expect(s.controller.summary({cabinetId:20,projectId:7},{apiKeyUserId:1})).rejects.toThrow(ForbiddenException);expect(s.projects.findOne).not.toHaveBeenCalled();
    });
    it.each([null,{...owner,banned:true},{...owner,vpbx_user_id:99}])('refuses unavailable or nested cabinet %s',async account=>{
        const s=setup(admin,account);await expect(s.controller.summary({cabinetId:20,projectId:7},{apiKeyUserId:1})).rejects.toThrow(ForbiddenException);expect(s.projects.findOne).not.toHaveBeenCalled();
    });
    it('refuses a foreign project before processing query',async()=>{
        const s=setup(admin,owner,null);await expect(s.controller.summary({cabinetId:20,projectId:7},{apiKeyUserId:1})).rejects.toThrow(ForbiddenException);
        expect(s.projects.findOne).toHaveBeenCalledWith({where:{id:7,userId:'20'},attributes:['id']});expect(s.projects.sequelize.query).not.toHaveBeenCalled();
    });
});
