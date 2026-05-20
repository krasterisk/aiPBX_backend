import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { getModelToken } from '@nestjs/sequelize';
import { of } from 'rxjs';
import { SbisService } from './sbis.service';
import { EgrulCache } from './egrul-cache.model';

describe('SbisService', () => {
    let service: SbisService;
    const httpPost = jest.fn();
    const httpGet = jest.fn();
    const egrulFindByPk = jest.fn();
    const egrulUpsert = jest.fn();

    beforeEach(async () => {
        jest.clearAllMocks();
        process.env.SBIS_LOGIN = 'user';
        process.env.SBIS_PASS = 'pass';

        const moduleRef = await Test.createTestingModule({
            providers: [
                SbisService,
                {
                    provide: HttpService,
                    useValue: { post: httpPost, get: httpGet },
                },
                {
                    provide: getModelToken(EgrulCache),
                    useValue: {
                        findByPk: egrulFindByPk,
                        upsert: egrulUpsert,
                    },
                },
            ],
        }).compile();

        service = moduleRef.get(SbisService);
        egrulFindByPk.mockResolvedValue(null);
        egrulUpsert.mockResolvedValue([{}, true]);
    });

    afterEach(() => {
        delete process.env.SBIS_LOGIN;
        delete process.env.SBIS_PASS;
    });

    it('caches session after auth', async () => {
        httpPost.mockReturnValueOnce(of({ data: { result: 'session-abc' } }));
        const s1 = await service.auth();
        const s2 = await service.auth();
        expect(s1).toBe('session-abc');
        expect(s2).toBe('session-abc');
        expect(httpPost).toHaveBeenCalledTimes(1);
        expect(httpPost.mock.calls[0][0]).toContain('/auth/service/');
    });

    it('lookupCounterparty maps SBIS response and caches', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            '@Лицо': '12345',
                            СвЮЛ: {
                                Название: 'ООО Тест',
                                КПП: '770101001',
                                ОГРН: '1027700132195',
                                АдресЮридический: 'Москва',
                            },
                        },
                    },
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Контрагент: {
                                СвЮЛ: {
                                    Название: 'ООО Тест',
                                    КПП: '770101001',
                                },
                            },
                        },
                    },
                }),
            );

        const r = await service.lookupCounterparty('7707083893');
        expect(r.name).toBe('ООО Тест');
        expect(r.kpp).toBe('770101001');
        expect(r.inn).toBe('7707083893');
        expect(egrulUpsert).toHaveBeenCalled();
    });

    it('returns null auth when credentials missing', async () => {
        delete process.env.SBIS_LOGIN;
        const s = await service.auth();
        expect(s).toBeNull();
    });

    it('createInvoiceDraft sends document date as DD.MM.YYYY', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Документ: { Идентификатор: 'doc-1', Номер: '42' },
                        },
                    },
                }),
            );

        await service.createInvoiceDraft({
            number: '42',
            documentDate: '2026-05-20',
            amountRub: 1000,
            subject: 'Услуги',
            paymentPurpose: 'Test',
            counterpartyInn: '7707083893',
            counterpartyKpp: '770101001',
            counterpartyName: 'ООО Тест',
            legalForm: 'ul',
            ourOrganizationInn: '1234567890',
            ourOrganizationKpp: '123456789',
        });

        const rpcBody = httpPost.mock.calls[1][1];
        expect(rpcBody.method).toBe('СБИС.ЗаписатьДокумент');
        expect(rpcBody.params.Документ.Дата).toBe('20.05.2026');
    });
});
