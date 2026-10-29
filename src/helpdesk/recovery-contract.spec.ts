import { originalReceivedAt,RECOVERY_TIME_POLICY,recoveryCost,recoveryHash,recordingKey,sameQuote,quoteDigest,recoveryRecordHash } from './recovery-contract';
import { RecoveryController } from './recovery.controller';

describe('recovery immutable contract',()=>{
    it('keeps original receipt time without interpreting a filename or using now',()=>{
        expect(RECOVERY_TIME_POLICY).toBe('original-received-at-v1');
        expect(originalReceivedAt({createdAt:'2026-10-28T04:40:15.574Z'})).toBe('2026-10-28T04:40:15.574Z');
        expect(originalReceivedAt({createdAt:new Date(),ingestedAt:'2026-10-28T04:40:15.574Z'})).toBe('2026-10-28T04:40:15.574Z');
        expect(()=>originalReceivedAt({createdAt:'invalid'})).toThrow();
        expect(()=>originalReceivedAt({createdAt:new Date(Date.now()+3600000)})).toThrow();
    });
    it('includes cabinet/project and exact recording identity in dedup keys',()=>{
        const a=recordingKey('20',7,'https://pbx.example.test/record.mp3');
        expect(a).not.toBe(recordingKey('21',7,'https://pbx.example.test/record.mp3'));
        expect(a).not.toBe(recordingKey('20',8,'https://pbx.example.test/record.mp3'));
    });
    it('detects a changed manifest, price, provider or scope',()=>{
        const base:any={id:'synthetic',owner:'20',project:7,candidates:[{recordId:1,receivedAt:'2026-10-28T01:00:00Z'}],maxAmount:100,tariff:{analytic:5,stt:0.1,provider:'whisper'}};
        const q={...base,snapshotHash:quoteDigest(base)};expect(sameQuote(q)).toBe(true);
        for(const patch of [{project:8},{maxAmount:101},{candidates:[]},{tariff:{...base.tariff,provider:'openai'}}])expect(sameQuote({...q,...patch})).toBe(false);
        expect(recoveryHash({a:1,b:2})).toBe(recoveryHash({b:2,a:1}));
    });
    it('hashes original identity, not the current processing status/date',()=>{
        const r={id:1,userId:'20',projectId:7,recordUrl:'https://pbx.example.test/a.mp3',filename:'anything.mp3',createdAt:'2026-10-28T01:00:00Z'};
        expect(recoveryRecordHash(r)).toBe(recoveryRecordHash({...r,status:'processing',updatedAt:new Date()}));
        expect(recoveryRecordHash(r)).toBe(recoveryRecordHash({...r,createdAt:new Date(),ingestedAt:r.createdAt}));
        expect(recoveryRecordHash(r)).not.toBe(recoveryRecordHash({...r,recordUrl:'https://other.example.test/a.mp3'}));
    });
    it('uses the frozen local STT and analytic tariff, refusing provider changes',()=>{
        expect(recoveryCost(12345,120,{analytic:5,stt:0.1,provider:'whisper'},'whisper')).toEqual({usd:0.061725,analysis:0.061725,stt:0});
        for(const [units,seconds,provider]of [[-1,10,'whisper'],[1,NaN,'whisper'],[1,10,'openai']]as const)expect(()=>recoveryCost(units,seconds,{analytic:5,stt:0.1,provider:'whisper'},provider)).toThrow();
    });
});

describe('recovery endpoint authority',()=>{
    const work={createQuote:jest.fn(),enqueue:jest.fn(),status:jest.fn(),cancel:jest.fn()};
    beforeEach(()=>jest.clearAllMocks());
    it.each([null,{isActivated:true,banned:false,roles:[{value:'USER'}]},{isActivated:false,banned:false,roles:[{value:'ADMIN'}]},{isActivated:true,banned:true,roles:[{value:'ADMIN'}]}])('rejects inactive/non-admin caller %s',async account=>{
        const controller=new RecoveryController({findByPk:jest.fn().mockResolvedValue(account)}as never,work as never);
        await expect(controller.start({cabinetId:20,projectId:7}as never,{apiKeyUserId:1})).rejects.toThrow();expect(work.enqueue).not.toHaveBeenCalled();
    });
    it('rejects a missing key before any account/paid operation',async()=>{
        const users={findByPk:jest.fn()};const controller=new RecoveryController(users as never,work as never);
        await expect(controller.start({cabinetId:20,projectId:7}as never,{})).rejects.toThrow();expect(users.findByPk).not.toHaveBeenCalled();expect(work.enqueue).not.toHaveBeenCalled();
    });
});
