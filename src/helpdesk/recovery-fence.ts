import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { recordingKey } from './recovery-contract';
const ready=new WeakSet<Sequelize>();
export function recoverySchemaReady(db:Sequelize):void{ready.add(db)}

/** Existing native requests cannot race an approved recovery of the same recording. */
export async function recoveryReserved(db:Sequelize|undefined,record:any,tx?:Transaction):Promise<boolean>{
    if(!db||!ready.has(db)||db.getDialect()!=='postgres'||(!record?.recordUrl&&!record?.audioSha256)||!record?.projectId)return false;
    const rows=await db.query(`SELECT 1 FROM helpdesk_recovery_items i JOIN operator_analytics original ON original.id=i.record_id
        WHERE i.owner_id=:owner AND i.project_id=:project
        AND (i.recording_key=:key OR (:audioHash IS NOT NULL AND original."audioSha256"=:audioHash)) LIMIT 1`,
        {type:QueryTypes.SELECT,replacements:{owner:String(record.userId),project:record.projectId,key:record.recordUrl?recordingKey(String(record.userId),record.projectId,record.recordUrl):null,audioHash:record.audioSha256||null},transaction:tx});
    return rows.length>0;
}
