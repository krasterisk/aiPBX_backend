import { OperatorAnalyticsService } from '../operator-analytics/operator-analytics.service';
import { PreparedRecovery } from './recovery-contract';

describe('native recovery result projection',()=>{
    it('uses the outer settlement transaction and original receipt for every history projection',async()=>{
        const tx:any={LOCK:{UPDATE:'UPDATE'}},receivedAt='2026-10-28T02:13:00.000Z';
        const p:PreparedRecovery={recordId:19,owner:'20',project:7,receivedAt,audioHash:'hash',transcript:'Synthetic',duration:40,provider:'whisper',billableSeconds:40,units:1000,schemaVersion:3,
            recordFields:{transcription:'Synthetic'},cdrFields:{channelId:'19',userId:'20',projectId:7},analysisFields:{metrics:{summary:'Synthetic'}},billingFields:{channelId:'19'},tagIds:[]};
        const record={userId:'20',projectId:7,update:jest.fn().mockResolvedValue(null)};
        const repo=()=>({create:jest.fn().mockResolvedValue(null),sequelize:{query:jest.fn().mockResolvedValue(null)}});
        const svc:any=Object.create(OperatorAnalyticsService.prototype);
        svc.aiCdrRepository=repo();svc.billingRecordRepository=repo();svc.analyticsRepository={findByPk:jest.fn().mockResolvedValue(record),sequelize:{query:jest.fn().mockResolvedValue(null)}};
        svc.persistAnalysisProjection=jest.fn().mockResolvedValue(null);svc.writeMetricValues=jest.fn().mockResolvedValue(null);svc.writeAutoCallTags=jest.fn().mockResolvedValue(null);
        await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);
        expect(svc.aiCdrRepository.create.mock.calls[0][0].createdAt.toISOString()).toBe(receivedAt);
        expect(svc.aiCdrRepository.create.mock.calls[0][1]).toEqual({transaction:tx});
        expect(svc.persistAnalysisProjection.mock.calls[0][0].createdAt.toISOString()).toBe(receivedAt);
        expect(svc.persistAnalysisProjection.mock.calls[0][5]).toBe(tx);
        expect(svc.billingRecordRepository.create.mock.calls[0][1]).toEqual({transaction:tx});
        expect(+svc.billingRecordRepository.create.mock.calls[0][0].fxCapturedAt).toBeGreaterThan(Date.parse(receivedAt));
        expect(svc.analyticsRepository.sequelize.query.mock.calls[0][1].replacements.receivedAt).toBe(receivedAt);
        expect(record.update.mock.calls[0][1].transaction).toBe(tx);
        expect(svc.writeMetricValues.mock.calls[0].at(-1)).toBe(tx);expect(svc.writeAutoCallTags.mock.calls[0].at(-1)).toBe(tx);
    });
});
