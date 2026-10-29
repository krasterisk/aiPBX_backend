import { createHash } from 'crypto';

export const RECOVERY_CONTRACT = 'analytics-recovery-v1';
export const RECOVERY_TIME_POLICY = 'original-received-at-v1';
export function recoveryHash(value: unknown): string {
    const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function recordingKey(owner: string, project: number, url: string): string {
    // Preserve the full original link identity; never expose it in a proposal.
    return recoveryHash({owner,project,url});
}

export function originalReceivedAt(record: {ingestedAt?: string | Date;createdAt:string | Date}):string {
    const value=new Date(record.ingestedAt||record.createdAt);
    if(!Number.isFinite(+value)||+value>Date.now()+30000)throw Error('original_receipt_time_unverified');
    return value.toISOString();
}

export interface RecoveryCandidate {recordId:number; recordingKey:string; receivedAt:string; ingestedAt:string; recordHash:string;}
export function recoveryRecordHash(r:any):string {
    return recoveryHash({id:r.id,owner:String(r.userId),project:r.projectId,url:r.recordUrl,filename:r.filename,
        ingestedAt:originalReceivedAt(r),operator:r.operatorName||null,operatorId:r.operatorId||null,operatorExtension:r.operatorExtension||null,
        phone:r.clientPhone||null,language:r.language||'auto',callType:r.callType||'incoming'});
}
export interface RecoveryQuote {
    id:string; owner:string; project:number; period:{start:string;end:string;timeZone:string};
    candidates:RecoveryCandidate[]; schemaHash:string; tariff:{analytic:number;stt:number;provider:'whisper'};
    currency:'USD'|'RUB'; fx:number; estimate:number; maxAmount:number; snapshotHash:string;
}
export function quoteDigest(q:Omit<RecoveryQuote,'snapshotHash'>):string{return recoveryHash(q)}
export function sameQuote(q:RecoveryQuote):boolean {const {snapshotHash,...rest}=q;return snapshotHash===quoteDigest(rest)}
export function recoveryCost(units:number,sttSeconds:number,tariff:RecoveryQuote['tariff'],provider:string):{usd:number;analysis:number;stt:number}{
    if(provider!==tariff.provider||!Number.isSafeInteger(units)||units<0||!Number.isFinite(sttSeconds)||sttSeconds<0)throw Error('recovery_charge_input_invalid');
    const round=(n:number)=>Math.round(n*1e6)/1e6;
    const analysis=round(units*tariff.analytic/1e6),stt=provider==='whisper'?0:round(sttSeconds/60*tariff.stt);
    return {usd:round(analysis+stt),analysis,stt};
}

export interface PreparedRecovery {
    recordId:number; owner:string; project:number; receivedAt:string; audioHash:string;
    transcript:string; duration:number; provider:string; billableSeconds:number; units:number;
    schemaVersion:number; recordFields:Record<string,any>; cdrFields:Record<string,any>;
    analysisFields:Record<string,any>; billingFields:Record<string,any>; tagIds:string[];
}
