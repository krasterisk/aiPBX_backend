import { Sequelize,QueryTypes } from 'sequelize';
import { RecoveryService } from './recovery.service';
import { PreparedRecovery } from './recovery-contract';
import { recoveryReserved } from './recovery-fence';

const url=process.env.HELPDESK_RECOVERY_TEST_DATABASE;
const integration=url?describe:describe.skip;
integration('recovery PostgreSQL atomicity / concurrency / dates',()=>{
    let db:Sequelize,svc:RecoveryService,provider:any;
    let received:Record<number,string>,period:string;
    const select=(sql:string)=>db.query<any>(sql,{type:QueryTypes.SELECT});
    beforeAll(async()=>{
        const parsed=new URL(url!);
        if(!['127.0.0.1','localhost'].includes(parsed.hostname)||parsed.pathname!=='/recovery_test')throw Error('Only disposable loopback recovery_test is permitted');
        db=new Sequelize(url!,{logging:false,pool:{max:8,min:0}});
        const [identity]=await select('SELECT current_database() AS name,inet_server_addr()::text AS host');
        if(identity.name!=='recovery_test'||!['127.0.0.1','::1'].includes(String(identity.host).split('/')[0]))throw Error('Refuse non-isolated database');
    });
    afterAll(async()=>{await db?.close()});
    beforeEach(async()=>{
        process.env.TENANT_CURRENCY='RUB';
        await db.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
        await db.query(`CREATE TABLE users(id integer PRIMARY KEY,balance double precision,banned boolean DEFAULT false,vpbx_user_id integer);
            CREATE TABLE operator_projects(id integer PRIMARY KEY,"userId" text,name text,"currentSchemaVersion" integer,"systemPrompt" text,"successPrompt" text,"customMetricsSchema" jsonb,"callTaxonomy" jsonb,"topicSchemeState" jsonb,"singleTopic" boolean,"qualityScoreConfig" jsonb,"visibleDefaultMetrics" jsonb);
            CREATE TABLE prices("userId" integer PRIMARY KEY,analytic double precision,stt double precision);
            CREATE TABLE rates(currency text PRIMARY KEY,rate double precision);
            CREATE TABLE operator_analytics(id integer PRIMARY KEY,"userId" text,"projectId" integer,filename text,"recordUrl" text,status text,"errorMessage" text,
                duration double precision,transcription text,"sttProvider" text,"schemaVersion" integer,"audioSha256" text,"operatorName" text,"operatorId" text,"operatorExtension" text,"clientPhone" text,language text,"callType" text,"createdAt" timestamptz,"updatedAt" timestamptz DEFAULT now());
            CREATE TABLE "aiCdr"(id serial PRIMARY KEY,"channelId" text UNIQUE,"userId" text,"projectId" integer,tokens integer DEFAULT 0,duration integer,cost double precision,"recordUrl" text,source text,"createdAt" timestamptz DEFAULT now());
            CREATE TABLE "billingRecords"(id serial PRIMARY KEY,"channelId" text,"userId" text,"totalCost" double precision,"createdAt" timestamptz DEFAULT now());
            CREATE TABLE balance_ledger(id serial PRIMARY KEY,"userId" text,direction text,"amountUsd" numeric(14,4),"balanceBeforeUsd" numeric(14,4),"balanceAfterUsd" numeric(14,4),source text,"externalId" text,meta jsonb,"createdAt" timestamptz DEFAULT now(),UNIQUE(source,"externalId"));
            INSERT INTO users VALUES(20,100,false,NULL),(21,100,false,NULL);
            INSERT INTO operator_projects(id,"userId",name,"currentSchemaVersion","systemPrompt")VALUES(7,'20','Synthetic',1,'Current project');
            INSERT INTO prices VALUES(20,5,0.1);INSERT INTO rates VALUES('USD',1),('RUB',80);`);
        const today=new Date().toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
        period=yesterday+'/'+today;
        received={1:yesterday+'T20:00:00.000Z',2:yesterday+'T09:00:00.000Z',3:today+'T00:00:00.000Z'};
        for(const id of [1,2,3])await db.query(`INSERT INTO operator_analytics(id,"userId","projectId",filename,"recordUrl",status,"errorMessage","createdAt")VALUES(:id,'20',7,:filename,:url,'error','Insufficient balance',:at)`,
            {replacements:{id,filename:'synthetic-'+id+'.mp3',url:'https://pbx.example.test/audio/'+id+'.mp3',at:received[id]}});
        for(let i=100;i<112;i++){
            await db.query(`INSERT INTO operator_analytics(id,"userId","projectId",filename,"recordUrl",status,duration,transcription,"sttProvider","schemaVersion","createdAt")VALUES(:id,'20',7,'sample.mp3',:url,'completed',100,'synthetic','whisper',1,now()-interval '1 hour');
                INSERT INTO "aiCdr"("channelId","userId","projectId",tokens,duration,cost,"createdAt")VALUES(:channel,'20',7,2000,100,0.01,now()-interval '1 hour')`,{replacements:{id:i,url:'https://pbx.example.test/sample/'+i+'.mp3',channel:String(i)}});
        }
        provider={prepareRecovery:jest.fn(async(owner:string,project:number,c:any):Promise<PreparedRecovery>=>({recordId:c.recordId,owner,project,receivedAt:c.receivedAt,audioHash:'hash'+c.recordId,
            transcript:'Synthetic transcript',duration:30,provider:'whisper',billableSeconds:30,units:1000,schemaVersion:1,recordFields:{},cdrFields:{},analysisFields:{},billingFields:{},tagIds:[]})),
            commitRecovery:jest.fn(async(p:PreparedRecovery,cost:any,_fx:any,_currency:any,tx:any)=>{
                await db.query(`INSERT INTO "aiCdr"("channelId","userId","projectId",tokens,duration,cost,"createdAt","processedAt")VALUES(:id,:owner,:project,1000,30,:cost,:at,now());
                    INSERT INTO "billingRecords"("channelId","userId","totalCost")VALUES(:id,:owner,:cost);
                    UPDATE operator_analytics SET status='completed',"errorMessage"=NULL,transcription='Synthetic transcript',"createdAt"=:at,"processedAt"=now() WHERE id=CAST(:id AS integer)`,
                    {transaction:tx,replacements:{id:String(p.recordId),owner:p.owner,project:p.project,cost:cost.usd,at:p.receivedAt}});
            })};
        svc=new RecoveryService({sequelize:db}as never,provider);
        await svc.onModuleInit();
    });
    async function quote(maxAmount=100){return(await svc.createQuote('20',7,{period,timeZone:'UTC',timePolicy:'original-received-at-v1',recordingOrigin:'https://pbx.example.test',maxAmount})).quote}
    function approval(q:any){return{quoteId:q.id,quoteHash:q.hash,consentHash:'c'.repeat(64),approvalId:'a'.repeat(32),approvalHash:'b'.repeat(20)}}
    it('stores a fixed sorted manifest without starting providers',async()=>{
        const q=await quote();expect(q.count).toBe(3);expect(provider.prepareRecovery).not.toHaveBeenCalled();
        const [saved]=await select('SELECT quote FROM helpdesk_recovery_quotes');expect(saved.quote.candidates.map((r:any)=>r.recordId)).toEqual([2,1,3]);
        expect(q.originalReceiptDatesPreserved).toBe(true);expect(JSON.stringify(q)).not.toContain('recordUrl');expect(JSON.stringify(q)).not.toContain('filename');
    });
    it('processes oldest receipts first and keeps historical dates, with charge time separate',async()=>{
        const q=await quote();const started=await svc.enqueue('20',7,approval(q));await svc.tick();
        expect(provider.prepareRecovery.mock.calls.map((c:any)=>c[2].recordId)).toEqual([2,1,3]);
        const state=await svc.status('20',7,started.job.id);expect(state.job.state).toBe('completed');expect(state.job.counts).toEqual({completed:3});
        const cdrs=await select('SELECT "channelId","createdAt","processedAt" FROM "aiCdr" WHERE "channelId" IN (\'1\',\'2\',\'3\')');
        for(const r of cdrs){expect(r.createdAt.toISOString()).toBe(received[Number(r.channelId)]);expect(+r.processedAt).toBeGreaterThanOrEqual(+r.createdAt)}
        const [wallet]=await select('SELECT balance FROM users WHERE id=20');expect(wallet.balance).toBeCloseTo(99.985,6);
        expect((await select('SELECT * FROM balance_ledger')).length).toBe(3);
    });
    it('deduplicates simultaneous start callbacks and competing workers',async()=>{
        const q=await quote();const [a,b]=await Promise.all([svc.enqueue('20',7,approval(q)),svc.enqueue('20',7,approval(q))]);expect(a.job.id).toBe(b.job.id);
        const other=new RecoveryService({sequelize:db}as never,provider);await other.onModuleInit();
        await Promise.all([svc.tick(),other.tick()]);await svc.tick();
        expect(provider.prepareRecovery).toHaveBeenCalledTimes(3);expect((await select('SELECT * FROM balance_ledger')).length).toBe(3);
        await svc.enqueue('20',7,approval(q));await svc.tick();expect(provider.prepareRecovery).toHaveBeenCalledTimes(3);
    });
    it('matches nullable legacy cabinet ban flags while rejecting banned or linked accounts',async()=>{
        await db.query('UPDATE users SET banned=NULL WHERE id=20');
        const q=await quote(),j=await svc.enqueue('20',7,approval(q));await svc.tick();
        expect((await svc.status('20',7,j.job.id)).job.state).toBe('completed');expect(provider.prepareRecovery).toHaveBeenCalledTimes(3);
        await db.query('UPDATE users SET banned=true WHERE id=20');await expect(quote()).rejects.toThrow('recovery_scope_changed');
        await db.query('UPDATE users SET banned=false,vpbx_user_id=21 WHERE id=20');await expect(quote()).rejects.toThrow('recovery_scope_changed');
    });
    it('does not process or charge a call completed after the quote',async()=>{
        const q=await quote();await db.query(`UPDATE operator_analytics SET status='completed' WHERE id=1`);
        const j=await svc.enqueue('20',7,approval(q));await svc.tick();expect(provider.prepareRecovery.mock.calls.map((c:any)=>c[2].recordId)).toEqual([2,3]);
        expect((await svc.status('20',7,j.job.id)).job.counts).toEqual({already_completed:1,completed:2});
    });
    it('refuses changed manifest/settings/tenant and requires approval receipt fields',async()=>{
        const q=await quote();await expect(svc.enqueue('21',7,approval(q))).rejects.toThrow();
        await expect(svc.enqueue('20',7,{...approval(q),quoteHash:'f'.repeat(64)})).rejects.toThrow();
        await expect(svc.enqueue('20',7,{...approval(q),consentHash:''})).rejects.toThrow();
        await db.query('UPDATE prices SET analytic=9 WHERE "userId"=20');await expect(svc.enqueue('20',7,approval(q))).rejects.toThrow();
        expect((await select('SELECT * FROM helpdesk_recovery_jobs')).length).toBe(0);expect(provider.prepareRecovery).not.toHaveBeenCalled();
    });
    it('rolls back result, wallet and ledger together after a post-debit failure, then settles cached work once',async()=>{
        const q=await quote();const j=await svc.enqueue('20',7,approval(q));const original=db.query.bind(db);let fail=true;
        (db as any).query=async(sql:any,options:any)=>{if(fail&&String(sql).startsWith("UPDATE helpdesk_recovery_items SET state='completed'")){fail=false;throw Error('synthetic crash after debit')}return original(sql,options)};
        await svc.tick();(db as any).query=original;
        expect((await select('SELECT * FROM balance_ledger')).length).toBe(0);expect((await select('SELECT * FROM "aiCdr" WHERE "channelId"=\'2\'')).length).toBe(0);
        expect((await select('SELECT balance FROM users WHERE id=20'))[0].balance).toBe(100);
        expect((await svc.status('20',7,j.job.id)).job.state).toBe('prepared');
        await svc.tick();expect(provider.prepareRecovery).toHaveBeenCalledTimes(3);expect((await select('SELECT * FROM balance_ledger')).length).toBe(3);
    });
    it('never retries an unknown provider attempt automatically',async()=>{
        provider.prepareRecovery.mockRejectedValueOnce(Error('unknown provider timeout'));
        const q=await quote();const j=await svc.enqueue('20',7,approval(q));await svc.tick();await svc.tick();
        expect(provider.prepareRecovery).toHaveBeenCalledTimes(1);expect((await svc.status('20',7,j.job.id)).job.state).toBe('uncertain');expect((await select('SELECT * FROM balance_ledger')).length).toBe(0);
    });
    it('stops at the confirmed budget without a debit or provider replay',async()=>{
        const q=await quote(0.1),j=await svc.enqueue('20',7,approval(q));await svc.tick();await svc.tick();
        expect(provider.prepareRecovery).toHaveBeenCalledTimes(1);expect((await svc.status('20',7,j.job.id)).job.state).toBe('waiting_budget');expect((await select('SELECT * FROM balance_ledger')).length).toBe(0);
    });
    it('waits for balance before providers, then resumes only the already approved queue',async()=>{
        const q=await quote(),j=await svc.enqueue('20',7,approval(q));await db.query('UPDATE users SET balance=0 WHERE id=20');await svc.tick();expect(provider.prepareRecovery).not.toHaveBeenCalled();
        expect((await svc.status('20',7,j.job.id)).job.state).toBe('waiting_balance');await db.query('UPDATE users SET balance=100 WHERE id=20');await svc.tick();expect(provider.prepareRecovery).toHaveBeenCalledTimes(3);
    });
    it('lets verification recover a lost enqueue receipt without starting anything',async()=>{
        const q=await quote();expect((await svc.statusForQuote('20',7,q.id)).job.state).toBe('not_started');expect(provider.prepareRecovery).not.toHaveBeenCalled();
        const j=await svc.enqueue('20',7,approval(q));expect((await svc.statusForQuote('20',7,q.id)).job.id).toBe(j.job.id);
    });
    it('fences normal native duplicates while recovery owns the recording',async()=>{
        const q=await quote();await svc.enqueue('20',7,approval(q));expect(await recoveryReserved(db,{userId:'20',projectId:7,recordUrl:'https://pbx.example.test/audio/1.mp3'})).toBe(true);
        expect(await recoveryReserved(db,{userId:'21',projectId:7,recordUrl:'https://pbx.example.test/audio/1.mp3'})).toBe(false);
    });
    it('cancels unstarted work without calling providers or charging',async()=>{
        const q=await quote(),j=await svc.enqueue('20',7,approval(q));await svc.cancel('20',7,j.job.id);await svc.tick();expect(provider.prepareRecovery).not.toHaveBeenCalled();
        expect((await svc.status('20',7,j.job.id)).job.state).toBe('cancelled');expect((await select('SELECT * FROM balance_ledger')).length).toBe(0);
    });
});
