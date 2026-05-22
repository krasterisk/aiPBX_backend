import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { getModelToken } from '@nestjs/sequelize';
import { HttpException, HttpStatus } from '@nestjs/common';
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
        (service as unknown as { sessionId: string | null }).sessionId = null;
        (service as unknown as { sessionExpiresAt: number }).sessionExpiresAt = 0;
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

        const r = await service.lookupCounterparty('7707083893', '770101001');
        expect(r.status).toBe('single');
        if (r.status !== 'single') throw new Error('expected single');
        expect(r.data.name).toBe('ООО Тест');
        expect(r.data.kpp).toBe('770101001');
        expect(r.data.inn).toBe('7707083893');
        expect(egrulUpsert).toHaveBeenCalled();

        const findRpc = httpPost.mock.calls[1][1];
        expect(findRpc.method).toBe('Контрагент.ПоИННКППКФ');
        expect(findRpc.params).toEqual({ params: { ИНН: '7707083893', КПП: '770101001' } });

        const infoRpc = httpPost.mock.calls[2][1];
        expect(infoRpc.method).toBe('СБИС.ИнформацияОКонтрагенте');
        expect(infoRpc.params).toEqual({
            Участник: { СвЮЛ: { ИНН: '7707083893', КПП: '770101001' } },
        });
    });

    it('maps СБИС.ИнформацияОКонтрагенте response from Участник', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        error: { message: 'find failed' },
                    },
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Участник: {
                                СвЮЛ: {
                                    Название: 'ООО Участник',
                                    КПП: '246501001',
                                    ИНН: '2465147176',
                                },
                            },
                        },
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176', '246501001');
        expect(r.status).toBe('single');
        if (r.status !== 'single') throw new Error('expected single');
        expect(r.data.name).toBe('ООО Участник');
        expect(r.data.kpp).toBe('246501001');
    });

    it('lookupCounterparty by INN only tries alternate param variant after requisites error', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        error: {
                            details: 'В объекте нет поля d',
                            message: 'Внутренняя ошибка сервера.',
                        },
                    },
                    status: 200,
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        result: [
                            { СвЮЛ: { Название: 'ООО Филиал A', КПП: '246501001' } },
                            { СвЮЛ: { Название: 'ООО Филиал B', КПП: '246502002' } },
                        ],
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176');
        expect(r.status).toBe('choose');
        if (r.status !== 'choose') throw new Error('expected choose');
        expect(r.candidates).toHaveLength(2);
        expect(httpPost).toHaveBeenCalledTimes(3);
    });

    it('lookupCounterparty by INN only returns choose when multiple branches found', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: [
                            {
                                СвЮЛ: {
                                    Название: 'ООО Филиал 1',
                                    КПП: '246501001',
                                },
                            },
                            {
                                СвЮЛ: {
                                    Название: 'ООО Филиал 2',
                                    КПП: '246502002',
                                },
                            },
                        ],
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176');
        expect(r).toEqual({
            status: 'choose',
            inn: '2465147176',
            candidates: expect.arrayContaining([
                expect.objectContaining({ name: 'ООО Филиал 1', kpp: '246501001' }),
                expect.objectContaining({ name: 'ООО Филиал 2', kpp: '246502002' }),
            ]),
        });
        expect(httpPost).toHaveBeenCalledTimes(2);
    });

    it('lookupCounterparty by INN only returns requires_kpp on SBIS "нет поля d" error', async () => {
        const sbisError = {
            code: -32602,
            message: 'Внутренняя ошибка сервера.\nПопробуйте выполнить операцию позднее.',
            details: 'В объекте нет поля d',
            type: 'error',
        };
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(of({ data: { error: sbisError }, status: 200 }))
            .mockReturnValueOnce(of({ data: { error: sbisError }, status: 200 }))
            .mockReturnValueOnce(of({ data: { error: sbisError }, status: 200 }));

        const r = await service.lookupCounterparty('2465147176');
        expect(r).toEqual({ status: 'requires_kpp', inn: '2465147176' });
    });

    it('rejects KPP that is a prefix of INN', async () => {
        const r = await service.lookupCounterparty('2465147176', '246514717');
        expect(r).toEqual({ status: 'requires_kpp', inn: '2465147176' });
        expect(httpPost).not.toHaveBeenCalled();
    });

    it('prefers KPP from SBIS response over invalid request KPP', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(of({ data: { error: { message: 'find failed' } } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Участник: {
                                СвЮЛ: {
                                    Название: 'ООО Участник',
                                    КПП: '246501001',
                                    ИНН: '2465147176',
                                },
                            },
                        },
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176', '246501001');
        expect(r.status).toBe('single');
        if (r.status !== 'single') throw new Error('expected single');
        expect(r.data.kpp).toBe('246501001');
    });

    it('rejects invalid KPP length for legal entity', async () => {
        const r = await service.lookupCounterparty('2465147176', '123');
        expect(r).toEqual({ status: 'requires_kpp', inn: '2465147176' });
        expect(httpPost).not.toHaveBeenCalled();
    });

    it('lookupCounterparty by INN only returns requires_kpp when no branches found', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {},
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176');
        expect(r).toEqual({ status: 'requires_kpp', inn: '2465147176' });
    });

    it('lookupCounterparty by INN only enriches single branch with full lookup', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            СвЮЛ: {
                                Название: 'ООО Один',
                                КПП: '246501001',
                            },
                        },
                    },
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            '@Лицо': '99',
                            СвЮЛ: {
                                Название: 'ООО Один',
                                КПП: '246501001',
                                ОГРН: '1022465010001',
                            },
                        },
                    },
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Участник: {
                                СвЮЛ: {
                                    Название: 'ООО Один',
                                    КПП: '246501001',
                                    ОГРН: '1022465010001',
                                },
                            },
                        },
                    },
                }),
            );

        const r = await service.lookupCounterparty('2465147176');
        expect(r.status).toBe('single');
        if (r.status !== 'single') throw new Error('expected single');
        expect(r.data.name).toBe('ООО Один');
        expect(r.data.kpp).toBe('246501001');
        expect(r.data.ogrn).toBe('1022465010001');
    });

    it('lookupCounterparty returns 502 when SBIS RPC fails for both methods', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        error: {
                            code: -32000,
                            message: 'Внутренняя ошибка сервера. Попробуйте выполнить операцию позднее.',
                        },
                    },
                    status: 200,
                }),
            )
            .mockReturnValueOnce(
                of({
                    data: {
                        error: {
                            message: 'Внутренняя ошибка сервера.',
                        },
                    },
                    status: 200,
                }),
            );

        await expect(service.lookupCounterparty('2465147176', '246501001')).rejects.toMatchObject({
            status: HttpStatus.BAD_GATEWAY,
            response: expect.objectContaining({
                inn: '2465147176',
                sbisErrors: expect.arrayContaining([
                    expect.objectContaining({ method: 'Контрагент.ПоИННКППКФ' }),
                    expect.objectContaining({ method: 'СБИС.ИнформацияОКонтрагенте' }),
                ]),
            }),
        });
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
        expect(rpcBody.params.Документ.Тип).toBe('СчетИсх');
    });

    it('createInvoiceDraft uses SBIS_INVOICE_DOC_TYPE override', async () => {
        process.env.SBIS_INVOICE_DOC_TYPE = 'ДокОтгрИсх';
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        result: {
                            Документ: { Идентификатор: 'doc-2', Номер: '43' },
                        },
                    },
                }),
            );

        await service.createInvoiceDraft({
            number: '43',
            documentDate: '2026-05-20',
            amountRub: 500,
            subject: 'Услуги',
            paymentPurpose: 'Test',
            counterpartyInn: '7707083893',
            counterpartyName: 'ООО Тест',
            legalForm: 'ul',
            ourOrganizationInn: '1234567890',
        });

        const rpcBody = httpPost.mock.calls[1][1];
        expect(rpcBody.params.Документ.Тип).toBe('ДокОтгрИсх');
    });

    it('findOutgoingSendStage locates Отправить action', () => {
        const found = service.findOutgoingSendStage({
            Этап: [
                {
                    Идентификатор: 'stage-1',
                    Название: 'Отправка',
                    Действие: [{ Название: 'Отправить' }],
                },
            ],
        });
        expect(found).toEqual({ stageId: 'stage-1', actionName: 'Отправить' });
    });

    it('edoAutoSendEnabled respects SBIS_EDO_AUTO_SEND=false', () => {
        process.env.SBIS_EDO_AUTO_SEND = 'false';
        expect(service.edoAutoSendEnabled()).toBe(false);
    });

    it('sendEdoInvitation treats Saby already-registered as state 7', async () => {
        httpPost
            .mockReturnValueOnce(of({ data: { result: 'session-1' } }))
            .mockReturnValueOnce(
                of({
                    data: {
                        error: {
                            code: -32000,
                            message:
                                'Контрагент уже зарегистрирован в Saby, приглашение не требуется, можно обмениваться документами.',
                            type: 'warning',
                        },
                    },
                    status: 200,
                }),
            );

        const result = await service.sendEdoInvitation({
            ourEdoParticipantId: '2BE72e386a8433e11e38c78005056917125',
            counterpartyInn: '246513890738',
            counterpartyEdoParticipantId: '2BEc84b324b724a4d50b42542562566332b',
            counterpartyName: 'ИП Тест',
            legalForm: 'ip',
        });

        expect(result.alreadyConnected).toBe(true);
        expect(result.stateCode).toBe(7);
        expect(result.invitationId).toBeNull();
    });
});
