import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { QueryTypes, Transaction } from 'sequelize';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { OperatorAnalyticsService } from '../operator-analytics/operator-analytics.service';
import { encryptTranscript, decryptTranscript } from '../operator-analytics/lib/transcript-crypto';
import { getTenantCurrency } from '../shared/tenant/tenant-currency';
import { processingPeriod, readProcessingSummary } from './processing-summary';
import { RECOVERY_SCHEMA } from './recovery-schema';
import { recoverySchemaReady } from './recovery-fence';
import { RECOVERY_CONTRACT, RECOVERY_TIME_POLICY, RecoveryCandidate, RecoveryQuote, PreparedRecovery, originalReceivedAt, recordingKey, recoveryHash, sameQuote, quoteDigest, recoveryCost, recoveryRecordHash } from './recovery-contract';

export function recoveryProjectHash(p:any):string {
    return recoveryHash(Object.fromEntries(['id','userId','currentSchemaVersion','systemPrompt','successPrompt','customMetricsSchema','callTaxonomy','topicSchemeState','singleTopic','qualityScoreConfig','visibleDefaultMetrics'].map(k=>[k,p[k]??null])));
}

@Injectable()
export class RecoveryService implements OnModuleInit {
    private ready=false;
    private busy=false;
    private readonly instance=randomUUID();
    constructor(@InjectModel(OperatorProject) private readonly projects:typeof OperatorProject,
        private readonly analytics:OperatorAnalyticsService){}
    get db(){return this.projects.sequelize}
    async onModuleInit(){
        if(this.db.getDialect()!=='postgres')return;
        await this.db.transaction(async tx=>{await this.db.query('SELECT pg_advisory_xact_lock(170229,1)',{transaction:tx});for(const sql of RECOVERY_SCHEMA)await this.db.query(sql,{transaction:tx});});
        recoverySchemaReady(this.db);this.ready=true;
    }
    private async q(sql:string,replacements:Record<string,any>={},transaction?:Transaction):Promise<any[]>{
        return this.db.query(sql,{type:QueryTypes.SELECT,replacements,transaction});
    }
    private envelope(q:RecoveryQuote,data:any){return {contract:RECOVERY_CONTRACT,clientId:q.owner,projectId:q.project,...data}}
    private async scope(owner:string,project:number,tx?:Transaction){
        const [account]=await this.q('SELECT id,balance FROM users WHERE id=CAST(:owner AS integer) AND banned IS NOT TRUE AND vpbx_user_id IS NULL',{owner},tx);
        const [p]=await this.q('SELECT * FROM operator_projects WHERE id=:project AND "userId"=:owner'+(tx?' FOR SHARE':''),{owner,project},tx);
        if(!account||!p)throw Error('recovery_scope_changed');return {account,project:p};
    }
    private async pricing(owner:string,currency:string,tx?:Transaction){
        const [p]=await this.q('SELECT analytic,stt FROM prices WHERE "userId"=CAST(:owner AS integer)'+(tx?' FOR SHARE':''),{owner},tx);
        const rows=await this.q("SELECT currency,rate FROM rates WHERE currency IN ('USD','RUB')"+(tx?' FOR SHARE':''),{},tx);
        const fx=currency==='USD'?1:Number(rows.find(r=>r.currency==='RUB')?.rate)/Number(rows.find(r=>r.currency==='USD')?.rate);
        if(!p||![p.analytic,p.stt,fx].every(v=>Number.isFinite(Number(v)))||Number(p.analytic)<0||Number(p.stt)<0||fx<=0)throw Error('recovery_price_unavailable');
        return {tariff:{analytic:Number(p.analytic),stt:Number(p.stt),provider:'whisper' as const},fx};
    }
    private async quoteById(owner:string,project:number,id:string,tx?:Transaction):Promise<RecoveryQuote>{
        const [row]=await this.q('SELECT quote,created_at FROM helpdesk_recovery_quotes WHERE id=:id AND owner_id=:owner AND project_id=:project',{id,owner,project},tx);
        if(!row||!sameQuote(row.quote))throw Error('recovery_quote_missing_or_changed');return row.quote;
    }
    publicQuote(q:RecoveryQuote){return this.envelope(q,{quote:{id:q.id,hash:q.snapshotHash,period:q.period,count:q.candidates.length,
        firstReceivedAt:q.candidates[0]?.receivedAt??null,lastReceivedAt:q.candidates.at(-1)?.receivedAt??null,
        estimatedAmount:q.estimate,maxAmount:q.maxAmount,currency:q.currency,provider:q.tariff.provider,
        tariff:{analysisUsdPerMillion:q.tariff.analytic,externalSttUsdPerMinute:q.tariff.stt,localWhisperSttUsdPerMinute:0},
        timeSource:RECOVERY_TIME_POLICY,originalReceiptDatesPreserved:true,order:'originalReceivedAt ASC, recordId ASC',
        approvalRequired:true,customerPriceConsentRequired:true,started:false}})}

    private async completedRecordings(owner:string,project:number,urls:string[]):Promise<Set<string>>{
        if(!urls.length)return new Set();
        // Bound quote latency: do not repeat an owner-history scan for each URL.
        const related=await this.q('SELECT id,"recordUrl",status FROM operator_analytics WHERE "userId"=:owner AND "projectId"=:project AND "recordUrl" IN (:urls)',{owner,project,urls:[...new Set(urls)]});
        if(!related.length)return new Set();const ids=related.map(r=>String(r.id));
        const cdr=await this.q('SELECT "channelId" FROM "aiCdr" WHERE "userId"=:owner AND "projectId"=:project AND "channelId" IN (:ids)',{owner,project,ids});
        const billed=await this.q('SELECT "channelId" FROM "billingRecords" WHERE "userId"=:owner AND "channelId" IN (:ids)',{owner,ids});
        const done=new Set([...cdr,...billed].map(r=>r.channelId));
        return new Set(related.filter(r=>r.status==='completed'||done.has(String(r.id))).map(r=>r.recordUrl));
    }

    async createQuote(owner:string,project:number,input:{period?:string;timeZone:string;timePolicy:string;recordingOrigin:string;maxAmount?:number}){
        if(!this.ready||input.timePolicy!==RECOVERY_TIME_POLICY)throw Error('recovery_time_policy_not_configured');
        const period=processingPeriod(input.period,input.timeZone);
        const origin=new URL(input.recordingOrigin);if(origin.origin!==input.recordingOrigin||origin.username||origin.password||!['http:','https:'].includes(origin.protocol))throw Error('recovery_recording_origin_invalid');
        const scope=await this.scope(owner,project),currency=getTenantCurrency();
        const {tariff,fx}=await this.pricing(owner,currency);
        const summary=await readProcessingSummary(this.db,Number(owner),project,period,currency);
        if(!summary.estimate.available)throw Error('recovery_estimate_unavailable');
        const rows=await this.q(`SELECT * FROM operator_analytics WHERE "userId"=:owner AND "projectId"=:project AND status='error'
            AND "errorMessage"='Insufficient balance' AND "createdAt">=(CAST(:start AS date)::timestamp AT TIME ZONE :zone)
            ORDER BY "createdAt",id LIMIT 10001`,{owner,project,start:period.start,zone:period.timeZone});
        if(rows.length>10000)throw Error('recovery_candidate_window_too_large');
        const done=await this.completedRecordings(owner,project,rows.map(r=>r.recordUrl).filter(Boolean));
        const candidates:RecoveryCandidate[]=[];const keys=new Set<string>();
        for(const r of rows){
            const url=new URL(r.recordUrl);if(url.origin!==origin.origin)throw Error('recovery_recording_origin_mismatch');
            const ingestedAt=new Date(r.ingestedAt||r.createdAt),receivedAt=originalReceivedAt(r);
            const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:input.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(receivedAt));
            const local=(k:string)=>localParts.find(p=>p.type===k)!.value;
            const day=local('year')+'-'+local('month')+'-'+local('day');if(day<period.start||day>period.end)continue;
            const key=recordingKey(owner,project,r.recordUrl);if(keys.has(key))continue;
            if(done.has(r.recordUrl))continue;keys.add(key);
            candidates.push({recordId:r.id,recordingKey:key,receivedAt,ingestedAt:ingestedAt.toISOString(),recordHash:recoveryRecordHash(r)});
        }
        candidates.sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt)||a.recordId-b.recordId);
        if(!candidates.length||candidates.length>1000)throw Error('recovery_empty_or_large_manifest');
        const estimate=Math.round(candidates.length*Number(summary.estimate.averageTokens)*tariff.analytic/1e6*fx*100)/100;
        const maxAmount=input.maxAmount??estimate;
        if(!Number.isFinite(maxAmount)||maxAmount<0||maxAmount>1000000)throw Error('recovery_budget_invalid');
        const base={id:randomUUID(),owner,project,period:{start:period.start,end:period.end,timeZone:period.timeZone},candidates,
            schemaHash:recoveryProjectHash(scope.project),tariff,currency,fx,estimate,maxAmount};
        const q:RecoveryQuote={...base,snapshotHash:quoteDigest(base)};
        await this.db.query('INSERT INTO helpdesk_recovery_quotes(id,owner_id,project_id,snapshot_hash,quote) VALUES(:id,:owner,:project,:hash,CAST(:quote AS jsonb))',
            {replacements:{id:q.id,owner,project,hash:q.snapshotHash,quote:JSON.stringify(q)}});
        return this.publicQuote(q);
    }

    async enqueue(owner:string,project:number,input:{quoteId:string;quoteHash:string;consentHash:string;approvalId:string;approvalHash:string}){
        if(!this.ready||!/^[a-f0-9]{20,80}$/.test(input.approvalId)||!/^[a-f0-9]{20,80}$/.test(input.approvalHash)||!/^[a-f0-9]{64}$/.test(input.consentHash))throw Error('recovery_approval_invalid');
        const id=await this.db.transaction(async tx=>{
            await this.q('SELECT pg_advisory_xact_lock(170230,:project)',{project},tx);
            const quote=await this.quoteById(owner,project,input.quoteId,tx);
            if(quote.snapshotHash!==input.quoteHash)throw Error('recovery_quote_changed');
            const [old]=await this.q('SELECT * FROM helpdesk_recovery_jobs WHERE quote_id=:quote',{quote:quote.id},tx);
            if(old){if(old.approval_id!==input.approvalId||old.approval_hash!==input.approvalHash||old.consent_hash!==input.consentHash)throw Error('recovery_quote_already_submitted');return old.id;}
            if(!(await this.q("SELECT id FROM helpdesk_recovery_quotes WHERE id=:id AND created_at>now()-interval '30 days'",{id:quote.id},tx)).length)throw Error('recovery_quote_expired');
            const current=await this.scope(owner,project,tx),price=await this.pricing(owner,quote.currency,tx);
            if(recoveryProjectHash(current.project)!==quote.schemaHash||recoveryHash(price.tariff)!==recoveryHash(quote.tariff)||price.fx!==quote.fx)throw Error('recovery_quote_stale');
            const job=randomUUID();
            await this.db.query(`INSERT INTO helpdesk_recovery_jobs(id,quote_id,owner_id,project_id,approval_id,consent_hash,approval_hash)
                VALUES(:job,:quote,:owner,:project,:approval,:consent,:approvalHash)`,{transaction:tx,replacements:{job,quote:quote.id,owner,project,approval:input.approvalId,consent:input.consentHash,approvalHash:input.approvalHash}});
            for(const c of quote.candidates){
                await this.db.query(`INSERT INTO helpdesk_recovery_items(job_id,owner_id,project_id,record_id,recording_key,received_at,ingested_at,record_hash)
                    VALUES(:job,:owner,:project,:record,:key,:receivedAt,:ingested,:hash)`,{transaction:tx,replacements:{job,owner,project,record:c.recordId,key:c.recordingKey,receivedAt:c.receivedAt,ingested:c.ingestedAt,hash:c.recordHash}});
            }return job;
        });return this.status(owner,project,id);
    }

    async status(owner:string,project:number,id:string){
        const [j]=await this.q('SELECT * FROM helpdesk_recovery_jobs WHERE id=:id AND owner_id=:owner AND project_id=:project',{id,owner,project});
        if(!j)throw Error('recovery_job_not_found');const q=await this.quoteById(owner,project,j.quote_id);
        const counts=await this.q('SELECT state,count(*)::int AS count FROM helpdesk_recovery_items WHERE job_id=:id GROUP BY state',{id});
        return this.envelope(q,{job:{id:j.id,quoteId:q.id,quoteHash:q.snapshotHash,state:j.state,counts:Object.fromEntries(counts.map(x=>[x.state,x.count])),
            approvalId:j.approval_id,approvalHash:j.approval_hash,consentHash:j.consent_hash,
            count:q.candidates.length,spentAmount:Number(j.spent_currency),maxAmount:q.maxAmount,currency:q.currency,stopReason:j.stop_reason,
            chronological:true,originalReceiptDates:true,provider:q.tariff.provider}});
    }

    async statusForQuote(owner:string,project:number,id:string){
        const q=await this.quoteById(owner,project,id);
        const [j]=await this.q('SELECT id FROM helpdesk_recovery_jobs WHERE quote_id=:id AND owner_id=:owner AND project_id=:project',{id,owner,project});
        return j?this.status(owner,project,j.id):this.envelope(q,{job:{id:null,quoteId:q.id,quoteHash:q.snapshotHash,state:'not_started',maxAmount:q.maxAmount,currency:q.currency}});
    }

    private async duplicate(q:RecoveryQuote,r:any,tx?:Transaction){
        const [done]=await this.q(`SELECT o.id FROM operator_analytics o WHERE o."userId"=:owner AND o."projectId"=:project
            AND (o."recordUrl"=:url OR (:audio IS NOT NULL AND o."audioSha256"=:audio))
            AND (o.status='completed' OR EXISTS(SELECT 1 FROM "aiCdr" c WHERE c."channelId"=CAST(o.id AS text) AND c."userId"=:owner AND c."projectId"=:project)
            OR EXISTS(SELECT 1 FROM "billingRecords" b WHERE b."channelId"=CAST(o.id AS text) AND b."userId"=:owner)) LIMIT 1`,
            {owner:q.owner,project:q.project,url:r.recordUrl,audio:r.audioSha256||null},tx);return !!done;
    }
    private async stop(job:string,state:string,reason:string){await this.db.query("UPDATE helpdesk_recovery_jobs SET state=:state,stop_reason=:reason,lease_owner=NULL,updated_at=now() WHERE id=:job AND state<>'cancelled'",{replacements:{job,state,reason}})}

    async viewQuote(owner:string,project:number,id:string){return this.publicQuote(await this.quoteById(owner,project,id))}
    async cancel(owner:string,project:number,id:string){
        await this.db.transaction(async tx=>{
            await this.db.query("UPDATE helpdesk_recovery_jobs SET state='cancelled',stop_reason='caller_cancelled',updated_at=now() WHERE id=:id AND owner_id=:owner AND project_id=:project AND state<>'completed'",{transaction:tx,replacements:{id,owner,project}});
            await this.db.query("UPDATE helpdesk_recovery_items SET state='cancelled',stop_reason='caller_cancelled' WHERE job_id=:id AND owner_id=:owner AND project_id=:project AND state='pending'",{transaction:tx,replacements:{id,owner,project}});
        });return this.status(owner,project,id);
    }

    @Interval(3000)
    async tick(){
        if(!this.ready||this.busy)return;this.busy=true;let job:any;
        try{
            // Unfinished provider attempts are uncertain, never automatically replayed.
            await this.db.query(`UPDATE helpdesk_recovery_jobs j SET state=CASE WHEN EXISTS(SELECT 1 FROM helpdesk_recovery_items WHERE job_id=j.id AND state='running') THEN 'uncertain' ELSE 'prepared' END,stop_reason='worker_lease_expired',updated_at=now()
                WHERE state='running' AND heartbeat_at<now()-interval '10 minutes'`);
            job=await this.db.transaction(async tx=>{
                const [j]=await this.q(`SELECT j.* FROM helpdesk_recovery_jobs j WHERE (j.state IN ('queued','prepared') OR (j.state='waiting_balance' AND EXISTS(SELECT 1 FROM users WHERE id=CAST(j.owner_id AS integer) AND balance>0 AND banned IS NOT TRUE)))
                    AND NOT EXISTS(SELECT 1 FROM helpdesk_recovery_jobs other WHERE other.id<>j.id AND other.owner_id=j.owner_id AND other.project_id=j.project_id
                    AND other.state IN ('running','uncertain','waiting_budget','waiting_balance','stale'))
                    ORDER BY (SELECT min(received_at) FROM helpdesk_recovery_items WHERE job_id=j.id),j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`,{},tx);
                if(!j)return null;
                const [lock]=await this.q('SELECT pg_try_advisory_xact_lock(170230,:project) AS ok',{project:j.project_id},tx);
                if(!lock.ok)return null;
                if((await this.q("SELECT id FROM helpdesk_recovery_jobs WHERE id<>:id AND owner_id=:owner AND project_id=:project AND state IN ('running','uncertain','waiting_budget','waiting_balance','stale') LIMIT 1",{id:j.id,owner:j.owner_id,project:j.project_id},tx)).length)return null;
                await this.db.query("UPDATE helpdesk_recovery_jobs SET state='running',lease_owner=:instance,heartbeat_at=now(),updated_at=now() WHERE id=:id",{transaction:tx,replacements:{instance:this.instance,id:j.id}});return j;
            });
            if(!job)return;
            const heartbeat=setInterval(()=>{void this.db.query("UPDATE helpdesk_recovery_jobs SET heartbeat_at=now() WHERE id=:id AND state='running' AND lease_owner=:instance",{replacements:{id:job.id,instance:this.instance}}).catch(()=>{});},15000);
            try{await this.run(job)}finally{clearInterval(heartbeat)}
        }catch(error){if(job){
            try{
                const counts=await this.q('SELECT state,count(*)::int AS count FROM helpdesk_recovery_items WHERE job_id=:id GROUP BY state',{id:job.id});
                const unknown=counts.some(r=>r.state==='running');
                const cached=counts.some(r=>r.state==='prepared');
                await this.stop(job.id,unknown?'uncertain':cached?'prepared':'uncertain',unknown?'provider_result_unknown':cached?'database_settlement_retry':'worker_result_unknown');
            }catch{await this.stop(job.id,'uncertain','worker_result_unknown').catch(()=>{})}
        }}
        finally{this.busy=false}
    }

    private async run(job:any){
        const q=await this.quoteById(job.owner_id,job.project_id,job.quote_id);
        for(const candidate of q.candidates){
            const [control]=await this.q('SELECT state,lease_owner FROM helpdesk_recovery_jobs WHERE id=:id',{id:job.id});
            if(control.state!=='running'||control.lease_owner!==this.instance)return;
            const [item]=await this.q('SELECT * FROM helpdesk_recovery_items WHERE job_id=:job AND record_id=:id',{job:job.id,id:candidate.recordId});
            if(['completed','already_completed','unusable'].includes(item.state))continue;
            if(!['pending','prepared'].includes(item.state)){await this.stop(job.id,'uncertain','item_result_unknown');return;}
            const current=await this.scope(q.owner,q.project),price=await this.pricing(q.owner,q.currency);
            if(recoveryProjectHash(current.project)!==q.schemaHash||recoveryHash(price.tariff)!==recoveryHash(q.tariff)||price.fx!==q.fx){await this.stop(job.id,'stale','quote_settings_changed');return;}
            const [r]=await this.q('SELECT * FROM operator_analytics WHERE id=:id AND "userId"=:owner AND "projectId"=:project',{id:candidate.recordId,owner:q.owner,project:q.project});
            if(!r||recoveryRecordHash(r)!==candidate.recordHash){await this.stop(job.id,'stale','record_identity_changed');return;}
            if(await this.duplicate(q,r)){
                await this.db.query("UPDATE helpdesk_recovery_items SET state='already_completed',completed_at=now() WHERE job_id=:job AND record_id=:id",{replacements:{job:job.id,id:candidate.recordId}});continue;
            }
            let p:PreparedRecovery;
            if(item.state==='prepared')p=JSON.parse(decryptTranscript(item.prepared)!);
            else{
                if(Number(current.account.balance)<=0){await this.stop(job.id,'waiting_balance','balance_not_positive');return;}
                await this.db.transaction(async tx=>{
                    await this.db.query("UPDATE helpdesk_recovery_items SET state='running',started_at=now() WHERE job_id=:job AND record_id=:id AND state='pending'",{transaction:tx,replacements:{job:job.id,id:candidate.recordId}});
                    await this.db.query(`UPDATE operator_analytics SET "ingestedAt"=COALESCE("ingestedAt","createdAt"),"createdAt"=:receivedAt,status='processing',"errorMessage"=NULL WHERE id=:id AND "userId"=:owner AND "projectId"=:project`,
                        {transaction:tx,replacements:{receivedAt:candidate.receivedAt,id:candidate.recordId,owner:q.owner,project:q.project}});
                });
                try{p=await this.analytics.prepareRecovery(q.owner,q.project,candidate)}catch(error){
                    if(error.message==='recovery_completed_duplicate'){
                        await this.db.query("UPDATE helpdesk_recovery_items SET state='already_completed',completed_at=now() WHERE job_id=:job AND record_id=:id",{replacements:{job:job.id,id:candidate.recordId}});
                        await this.db.query("UPDATE operator_analytics SET status='error',\"errorMessage\"='Already analysed recording skipped by approved recovery' WHERE id=:id",{replacements:{id:candidate.recordId}});continue;
                    }
                    if(error.message==='recovery_unusable_recording'){
                        await this.db.query("UPDATE helpdesk_recovery_items SET state='unusable',stop_reason='recording_not_suitable',completed_at=now() WHERE job_id=:job AND record_id=:id",{replacements:{job:job.id,id:candidate.recordId}});continue;
                    }
                    if(error.message==='recovery_busy_before_provider'){
                        await this.db.query("UPDATE helpdesk_recovery_items SET state='pending',started_at=NULL WHERE job_id=:job AND record_id=:id",{replacements:{job:job.id,id:candidate.recordId}});
                        await this.db.query("UPDATE operator_analytics SET status='error',\"errorMessage\"='Insufficient balance' WHERE id=:id",{replacements:{id:candidate.recordId}});
                        await this.stop(job.id,'queued','native_analysis_in_progress');return;
                    }
                    await this.stop(job.id,'uncertain','provider_attempt_unknown');return;
                }
                await this.db.query("UPDATE helpdesk_recovery_items SET state='prepared',prepared=:prepared WHERE job_id=:job AND record_id=:id",{replacements:{job:job.id,id:candidate.recordId,prepared:encryptTranscript(JSON.stringify(p))}});
            }
            const settled=await this.settle(job.id,q,candidate,p);
            if(!settled)return;
        }
        await this.stop(job.id,'completed','all_items_handled');
    }

    async settle(job:string,q:RecoveryQuote,candidate:RecoveryCandidate,p:PreparedRecovery):Promise<boolean>{
        return this.db.transaction(async tx=>{
            const [j]=await this.q('SELECT * FROM helpdesk_recovery_jobs WHERE id=:job FOR UPDATE',{job},tx);
            const [item]=await this.q('SELECT * FROM helpdesk_recovery_items WHERE job_id=:job AND record_id=:id FOR UPDATE',{job,id:candidate.recordId},tx);
            if(item.state==='completed'||item.state==='already_completed')return true;
            if(j.state==='cancelled')return false;
            if(j.state!=='running'||j.lease_owner!==this.instance||item.state!=='prepared'||p.recordId!==candidate.recordId||p.owner!==q.owner||p.project!==q.project||p.receivedAt!==candidate.receivedAt)throw Error('recovery_prepared_identity_changed');
            const [r]=await this.q('SELECT * FROM operator_analytics WHERE id=:id AND "userId"=:owner AND "projectId"=:project FOR UPDATE',{id:candidate.recordId,owner:q.owner,project:q.project},tx);
            if(!r||recoveryRecordHash(r)!==candidate.recordHash)throw Error('recovery_record_changed_before_settlement');
            if(await this.duplicate(q,r,tx)){
                await this.db.query("UPDATE helpdesk_recovery_items SET state='already_completed',completed_at=now() WHERE job_id=:job AND record_id=:id",{transaction:tx,replacements:{job,id:candidate.recordId}});return true;
            }
            const scope=await this.scope(q.owner,q.project,tx),price=await this.pricing(q.owner,q.currency,tx);
            if(recoveryProjectHash(scope.project)!==q.schemaHash||recoveryHash(price.tariff)!==recoveryHash(q.tariff)||price.fx!==q.fx)throw Error('recovery_settings_changed_before_settlement');
            const cost=recoveryCost(p.units,p.billableSeconds,q.tariff,p.provider),currencyCost=Math.round(cost.usd*q.fx*1e6)/1e6;
            if(Number(j.spent_currency)+currencyCost>q.maxAmount+0.0000001){
                await this.db.query("UPDATE helpdesk_recovery_jobs SET state='waiting_budget',stop_reason='confirmed_budget_exhausted',lease_owner=NULL,updated_at=now() WHERE id=:job",{transaction:tx,replacements:{job}});return false;
            }
            const [wallet]=await this.q('SELECT balance FROM users WHERE id=CAST(:owner AS integer) AND banned IS NOT TRUE AND vpbx_user_id IS NULL FOR UPDATE',{owner:q.owner},tx);
            if(!wallet||Number(wallet.balance)<=0||Number(wallet.balance)<cost.usd){await this.db.query("UPDATE helpdesk_recovery_jobs SET state='waiting_balance',stop_reason='insufficient_balance',lease_owner=NULL,updated_at=now() WHERE id=:job",{transaction:tx,replacements:{job}});return false;}
            const external='recovery:'+candidate.recordingKey;
            const [paid]=await this.q("SELECT id FROM balance_ledger WHERE source='usage_analytics' AND \"externalId\"=:external",{external},tx);
            if(paid)throw Error('recovery_existing_debit_requires_reconciliation');
            await this.analytics.commitRecovery(p,cost,q.fx,q.currency,tx);
            if(cost.usd>0){
                await this.db.query('UPDATE users SET balance=balance - :cost WHERE id=CAST(:owner AS integer)',{transaction:tx,replacements:{cost:cost.usd,owner:q.owner}});
                await this.db.query(`INSERT INTO balance_ledger("userId",direction,"amountUsd","balanceBeforeUsd","balanceAfterUsd",source,"externalId",meta,"createdAt")
                    VALUES(:owner,'debit',:cost,:before,:after,'usage_analytics',:external,CAST(:meta AS jsonb),now())`,
                    {transaction:tx,replacements:{owner:q.owner,cost:cost.usd.toFixed(4),before:Number(wallet.balance).toFixed(4),after:(Number(wallet.balance)-cost.usd).toFixed(4),external,meta:JSON.stringify({jobId:job,recordId:p.recordId,receivedAt:p.receivedAt})}});
            }
            await this.db.query("UPDATE helpdesk_recovery_items SET state='completed',charge_usd=:cost,completed_at=now() WHERE job_id=:job AND record_id=:id",{transaction:tx,replacements:{job,id:p.recordId,cost:cost.usd}});
            await this.db.query('UPDATE helpdesk_recovery_jobs SET spent_usd=spent_usd + :cost,spent_currency=spent_currency + :currencyCost,updated_at=now() WHERE id=:job',{transaction:tx,replacements:{job,cost:cost.usd,currencyCost}});
            return true;
        });
    }
}
