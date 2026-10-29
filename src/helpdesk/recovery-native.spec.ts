import { OperatorAnalyticsService } from '../operator-analytics/operator-analytics.service';
import { PreparedRecovery } from './recovery-contract';
import { Sequelize } from 'sequelize';

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

describe('recovery journal shadow',()=>{
    function fixture(){
        const p:any={recordId:19,owner:'20',project:7,receivedAt:'2026-10-28T02:13:00.000Z',cdrFields:{channelId:'19'},analysisFields:{metrics:{}},billingFields:{},recordFields:{},tagIds:[]};
        const svc:any=Object.create(OperatorAnalyticsService.prototype);
        const sequelize={query:jest.fn().mockResolvedValue(null),getDialect:()=> 'postgres'};
        svc.aiCdrRepository={create:jest.fn().mockResolvedValue(null),sequelize};svc.billingRecordRepository={create:jest.fn().mockResolvedValue(null)};
        svc.analyticsRepository={findByPk:jest.fn().mockResolvedValue({userId:'20',projectId:7,update:jest.fn().mockResolvedValue(null)}),sequelize};
        svc.persistAnalysisProjection=jest.fn().mockResolvedValue(null);svc.writeMetricValues=jest.fn().mockResolvedValue(null);svc.writeAutoCallTags=jest.fn().mockResolvedValue(null);
        svc.logger={warn:jest.fn()};svc.qualityPreview={ensure:jest.fn().mockResolvedValue(null)};
        return {svc,p};
    }
    it('publishes saved answers only after the financial transaction commits',async()=>{
        const {svc,p}=fixture(),tx:any={LOCK:{UPDATE:'UPDATE'},afterCommit:jest.fn()};
        await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);
        expect(svc.qualityPreview.ensure).not.toHaveBeenCalled();expect(tx.afterCommit).toHaveBeenCalledTimes(1);
        tx.afterCommit.mock.calls[0][0]();await Promise.resolve();expect(svc.qualityPreview.ensure).toHaveBeenCalledWith('19','20');
    });
    it('a derived-projection failure cannot turn an already committed debit into a replay',async()=>{
        const {svc,p}=fixture(),tx:any={LOCK:{UPDATE:'UPDATE'},afterCommit:jest.fn()};svc.qualityPreview.ensure.mockRejectedValueOnce(Error('synthetic projection failure'));
        await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);
        expect(()=>tx.afterCommit.mock.calls[0][0]()).not.toThrow();await Promise.resolve();await Promise.resolve();expect(svc.logger.warn).toHaveBeenCalled();
    });
    it('keeps the deployment preview opt-out',async()=>{
        const {svc,p}=fixture(),tx:any={LOCK:{UPDATE:'UPDATE'},afterCommit:jest.fn()},prior=process.env.QUALITY_PREVIEW_ENABLED;
        try{process.env.QUALITY_PREVIEW_ENABLED='false';await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);expect(tx.afterCommit).not.toHaveBeenCalled()}
        finally{if(prior===undefined)delete process.env.QUALITY_PREVIEW_ENABLED;else process.env.QUALITY_PREVIEW_ENABLED=prior}
    });
    const url=process.env.HELPDESK_RECOVERY_TEST_DATABASE;
    (url?it:it.skip)('never publishes a rolled back result, using a real PostgreSQL commit boundary',async()=>{
        const u=new URL(url);if(u.hostname!=='127.0.0.1'||u.pathname!=='/recovery_test')throw Error('Isolated loopback test database required');
        const db=new Sequelize(url,{logging:false});const {svc,p}=fixture();
        try{
            await expect(db.transaction(async tx=>{await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);throw Error('rollback')})).rejects.toThrow('rollback');
            expect(svc.qualityPreview.ensure).not.toHaveBeenCalled();
            await db.transaction(async tx=>{await svc.commitRecovery(p,{usd:.005,analysis:.005,stt:0},80,'RUB',tx);expect(svc.qualityPreview.ensure).not.toHaveBeenCalled()});
            expect(svc.qualityPreview.ensure).toHaveBeenCalledTimes(1);
        }finally{await db.close()}
    });
});
