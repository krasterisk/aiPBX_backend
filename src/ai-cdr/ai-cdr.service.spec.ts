import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Op, Sequelize } from 'sequelize';
import { AiCdrService } from './ai-cdr.service';
import { AiCdr } from './ai-cdr.model';
import { AiEvents } from './ai-events.model';
import { Assistant } from '../assistants/assistants.model';
import { BillingService } from '../billing/billing.service';
import { AiAnalyticsService } from '../ai-analytics/ai-analytics.service';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';
import { OperatorAnalytics } from '../operator-analytics/operator-analytics.model';
import { CallTag } from '../operator-analytics/operator-call-tag.model';

describe('AiCdrService', () => {
    let service: AiCdrService;
    let mockAiCdrRepository: any;
    let mockAiEventsRepository: any;
    let mockAssistantRepository: any;
    let mockBillingService: any;
    let mockAiAnalyticsService: any;
    let mockCallTagRepository: any;
    let mockCdrRecord: any;

    // ─── Mock Data ──────────────────────────────────────────────────────

    const mockCdrDto = {
        channelId: 'channel-001',
        callerId: '1006',
        userId: 1,
        tokens: 0,
        assistantId: '5',
        assistantName: 'TestBot',
        vPbxUserId: 100,
    };

    const mockEventDto = {
        channelId: 'channel-001',
        callerId: '1006',
        userId: 1,
        events: [{ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Привет' }],
        vPbxUserId: 100,
    };

    const mockEventRecord = {
        id: 1,
        channelId: 'channel-001',
        callerId: '1006',
        events: [{ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Привет' }],
        createdAt: '2026-02-13T10:00:00.000Z',
    };

    const mockAssistant = {
        id: 5,
        uniqueId: 'ast-uuid-123',
        analytic: true,
        sipAccount: {
            sipUri: 'sip:1006@pbx.example.com',
            records: true,
        },
    };

    // ─── Setup ──────────────────────────────────────────────────────────

    beforeEach(async () => {
        // Fresh mock per test to prevent state pollution between tests
        mockCdrRecord = {
            id: 1,
            channelId: 'channel-001',
            callerId: '1006',
            userId: '1',
            tokens: 500,
            cost: 0,
            assistantId: '5',
            assistantName: 'TestBot',
            duration: null,
            recordUrl: null,
            createdAt: new Date().toISOString(),
            update: jest.fn().mockResolvedValue(undefined),
            destroy: jest.fn().mockResolvedValue(undefined),
            toJSON: jest.fn().mockReturnValue({
                id: 1,
                channelId: 'channel-001',
                callerId: '1006',
                userId: '1',
                tokens: 500,
                cost: 0,
                assistantId: '5',
                assistantName: 'TestBot',
                duration: null,
                recordUrl: null,
                createdAt: new Date().toISOString(),
            }),
        };

        mockAiCdrRepository = {
            create: jest.fn(),
            findOrCreate: jest.fn(),
            findOne: jest.fn(),
            findByPk: jest.fn(),
            findAndCountAll: jest.fn(),
            findAll: jest.fn().mockResolvedValue([]),
            sum: jest.fn(),
            sequelize: {
                query: jest.fn(),
                getDialect: jest.fn().mockReturnValue('postgres'),
                transaction: jest.fn(async (cb: (t: unknown) => Promise<void>) => cb({})),
            },
        };

        mockAiEventsRepository = {
            create: jest.fn(),
            findAll: jest.fn(),
            destroy: jest.fn(),
        };

        mockAssistantRepository = {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
            findByPk: jest.fn(),
        };

        mockBillingService = {
            finalizeCallBilling: jest.fn().mockResolvedValue({ totalCost: 0.05 }),
            refundBillingForChannel: jest.fn().mockResolvedValue({ refundedUsd: 0.08, recordsCount: 2 }),
        };

        mockAiAnalyticsService = {
            analyzeCall: jest.fn(),
        };

        mockCallTagRepository = {
            findAll: jest.fn().mockResolvedValue([]),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiCdrService,
                { provide: getModelToken(AiCdr), useValue: mockAiCdrRepository },
                { provide: getModelToken(AiEvents), useValue: mockAiEventsRepository },
                { provide: getModelToken(AiAnalytics), useValue: { destroy: jest.fn() } },
                { provide: getModelToken(BillingRecord), useValue: { destroy: jest.fn() } },
                { provide: getModelToken(OperatorAnalytics), useValue: { destroy: jest.fn() } },
                { provide: getModelToken(CallTag), useValue: mockCallTagRepository },
                { provide: getModelToken(Assistant), useValue: mockAssistantRepository },
                { provide: BillingService, useValue: mockBillingService },
                { provide: AiAnalyticsService, useValue: mockAiAnalyticsService },
            ],
        }).compile();

        service = module.get<AiCdrService>(AiCdrService);
    });

    // ─── cdrCreate ──────────────────────────────────────────────────────

    describe('cdrCreate', () => {
        it('should create and return a new CDR record', async () => {
            mockAiCdrRepository.findOrCreate.mockResolvedValue([mockCdrRecord, true]);

            const result = await service.cdrCreate(mockCdrDto);

            expect(mockAiCdrRepository.findOrCreate).toHaveBeenCalledWith({
                where: { channelId: mockCdrDto.channelId },
                defaults: mockCdrDto,
            });
            expect(result).toEqual(mockCdrRecord);
        });

        it('should return existing record when channelId already exists', async () => {
            mockAiCdrRepository.findOrCreate.mockResolvedValue([mockCdrRecord, false]);

            const result = await service.cdrCreate(mockCdrDto);

            expect(result).toEqual(mockCdrRecord);
        });

        it('should throw HttpException on generic database error', async () => {
            mockAiCdrRepository.findOrCreate.mockRejectedValue(new Error('DB connection lost'));

            await expect(service.cdrCreate(mockCdrDto))
                .rejects
                .toThrow(HttpException);
        });
    });

    // ─── cdrUpdate ──────────────────────────────────────────────────────

    describe('cdrUpdate', () => {
        it('should find and update an existing CDR record', async () => {
            const updatedRecord = { ...mockCdrRecord, tokens: 1000 };
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockCdrRecord.update.mockResolvedValue(updatedRecord);

            const result = await service.cdrUpdate({ channelId: 'channel-001', tokens: 1000 } as any);

            expect(mockAiCdrRepository.findOne).toHaveBeenCalledWith({
                where: { channelId: 'channel-001' },
            });
            expect(mockCdrRecord.update).toHaveBeenCalledWith({ channelId: 'channel-001', tokens: 1000 });
            expect(result).toEqual(mockCdrRecord);
        });

        it('should throw NOT_FOUND when CDR record does not exist', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(null);

            await expect(service.cdrUpdate({ channelId: 'nonexistent' } as any))
                .rejects
                .toThrow(HttpException);
        });

        it('should throw BAD_REQUEST on update failure', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockCdrRecord.update.mockRejectedValue(new Error('Update failed'));

            await expect(service.cdrUpdate({ channelId: 'channel-001' } as any))
                .rejects
                .toThrow(HttpException);
        });
    });

    // ─── cdrHangup ──────────────────────────────────────────────────────

    describe('cdrHangup', () => {
        it('should finalize billing, calculate duration, build recordUrl, and update CDR', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockAssistantRepository.findOne.mockResolvedValue(mockAssistant);
            mockAssistantRepository.findByPk.mockResolvedValue(mockAssistant);

            const result = await service.cdrHangup('channel-001', 5);

            expect(mockBillingService.finalizeCallBilling).toHaveBeenCalledWith('channel-001');
            expect(mockCdrRecord.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    cost: 0.05,
                    recordUrl: 'https://pbx.example.com/records/ast-uuid-123/channel-001.mp3',
                    duration: expect.any(Number),
                }),
            );
            expect(result).toEqual(mockCdrRecord);
        });

        it('should trigger analyzeCall when assistant has analytic enabled', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockAssistantRepository.findOne.mockResolvedValue(mockAssistant);
            mockAssistantRepository.findByPk.mockResolvedValue({ ...mockAssistant, analytic: true });

            await service.cdrHangup('channel-001', 5);

            expect(mockAiAnalyticsService.analyzeCall).toHaveBeenCalledWith('channel-001');
        });

        it('should not trigger analyzeCall when assistant has analytic disabled', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockAssistantRepository.findOne.mockResolvedValue(mockAssistant);
            mockAssistantRepository.findByPk.mockResolvedValue({ ...mockAssistant, analytic: false });

            await service.cdrHangup('channel-001', 5);

            expect(mockAiAnalyticsService.analyzeCall).not.toHaveBeenCalled();
        });

        it('should set empty recordUrl when assistantId is 0 (no assistant)', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);

            await service.cdrHangup('channel-001', 0);

            expect(mockCdrRecord.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordUrl: '',
                }),
            );
        });

        it('should throw NOT_FOUND when CDR not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(null);

            await expect(service.cdrHangup('nonexistent', 5))
                .rejects
                .toThrow(HttpException);
        });

        it('should set empty recordUrl when assistant has no sipAccount', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdrRecord);
            mockAssistantRepository.findOne.mockResolvedValue({ ...mockAssistant, sipAccount: null });
            mockAssistantRepository.findByPk.mockResolvedValue({ ...mockAssistant, analytic: false });

            await service.cdrHangup('channel-001', 5);

            expect(mockCdrRecord.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    recordUrl: '',
                }),
            );
        });
    });

    // ─── eventCreate ────────────────────────────────────────────────────

    describe('eventCreate', () => {
        it('should create and return a new event', async () => {
            mockAiEventsRepository.create.mockResolvedValue(mockEventRecord);

            const result = await service.eventCreate(mockEventDto);

            expect(mockAiEventsRepository.create).toHaveBeenCalledWith(mockEventDto);
            expect(result).toEqual(mockEventRecord);
        });

        it('should throw HttpException on unique constraint error', async () => {
            const uniqueError = new Error('Duplicate');
            uniqueError.name = 'SequelizeUniqueConstraintError';
            mockAiEventsRepository.create.mockRejectedValue(uniqueError);

            await expect(service.eventCreate(mockEventDto))
                .rejects
                .toThrow(new HttpException('AiEvent already exists', HttpStatus.BAD_REQUEST));
        });

        it('should throw HttpException on generic error', async () => {
            mockAiEventsRepository.create.mockRejectedValue(new Error('DB error'));

            await expect(service.eventCreate(mockEventDto))
                .rejects
                .toThrow(HttpException);
        });
    });

    // ─── getEvents ──────────────────────────────────────────────────────

    describe('getEvents', () => {
        it('should return all events for a given channelId', async () => {
            const events = [mockEventRecord, { ...mockEventRecord, id: 2 }];
            mockAiEventsRepository.findAll.mockResolvedValue(events);

            const result = await service.getEvents('channel-001');

            expect(mockAiEventsRepository.findAll).toHaveBeenCalledWith({
                where: { channelId: 'channel-001' },
            });
            expect(result).toHaveLength(2);
        });

        it('should return empty array when no events exist', async () => {
            mockAiEventsRepository.findAll.mockResolvedValue([]);

            const result = await service.getEvents('channel-999');

            expect(result).toEqual([]);
        });

        it('should throw HttpException on DB error', async () => {
            mockAiEventsRepository.findAll.mockRejectedValue(new Error('Query failed'));

            await expect(service.getEvents('channel-001'))
                .rejects
                .toThrow(HttpException);
        });
    });

    // ─── getDialogs ─────────────────────────────────────────────────────

    describe('getDialogs', () => {
        it('should parse user transcription events correctly', async () => {
            const aiEvents = [{
                channelId: 'channel-001',
                createdAt: '2026-02-13T10:00:00.000Z',
                events: {
                    type: 'conversation.item.input_audio_transcription.completed',
                    transcript: 'Привет, как дела?',
                },
            }];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                role: 'User',
                text: 'Привет, как дела?',
            });
        });

        it('should parse assistant response.done events correctly', async () => {
            const aiEvents = [{
                channelId: 'channel-001',
                createdAt: '2026-02-13T10:00:05.000Z',
                events: {
                    type: 'response.done',
                    response: {
                        output: [{
                            content: [{ transcript: 'Всё хорошо, спасибо!' }],
                        }],
                    },
                },
            }];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                role: 'Assistant',
                text: 'Всё хорошо, спасибо!',
            });
        });

        it('should parse function_call events correctly', async () => {
            const aiEvents = [{
                channelId: 'channel-001',
                createdAt: '2026-02-13T10:00:10.000Z',
                events: {
                    type: 'response.done',
                    response: {
                        output: [{
                            type: 'function_call',
                            name: 'getWeather',
                            arguments: '{"city":"Moscow"}',
                            content: [],
                        }],
                    },
                },
            }];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                role: 'Assistant',
                text: 'Function call: getWeather({"city":"Moscow"})',
            });
        });

        it('should parse function_call_output events correctly', async () => {
            const aiEvents = [{
                channelId: 'channel-001',
                createdAt: '2026-02-13T10:00:12.000Z',
                events: {
                    type: 'conversation.item.created',
                    item: {
                        type: 'function_call_output',
                        output: '{"temp":"-5°C"}',
                    },
                },
            }];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                role: 'System',
                text: 'Function result: {"temp":"-5°C"}',
            });
        });

        it('should handle a full multi-turn conversation', async () => {
            const aiEvents = [
                {
                    createdAt: '2026-02-13T10:00:00.000Z',
                    events: {
                        type: 'conversation.item.input_audio_transcription.completed',
                        transcript: 'Какая погода?',
                    },
                },
                {
                    createdAt: '2026-02-13T10:00:02.000Z',
                    events: {
                        type: 'response.done',
                        response: {
                            output: [{
                                content: [{ transcript: 'Сейчас узнаю...' }],
                            }],
                        },
                    },
                },
                {
                    createdAt: '2026-02-13T10:00:05.000Z',
                    events: {
                        type: 'conversation.item.input_audio_transcription.completed',
                        transcript: 'Спасибо!',
                    },
                },
            ];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toHaveLength(3);
            expect(result[0].role).toBe('User');
            expect(result[1].role).toBe('Assistant');
            expect(result[2].role).toBe('User');
        });

        it('should return empty array when no events found', async () => {
            mockAiEventsRepository.findAll.mockResolvedValue([]);

            const result = await service.getDialogs('channel-no-events');

            expect(result).toEqual([]);
        });

        it('should skip unknown event types', async () => {
            const aiEvents = [{
                createdAt: '2026-02-13T10:00:00.000Z',
                events: { type: 'unknown.event.type', data: 'something' },
            }];
            mockAiEventsRepository.findAll.mockResolvedValue(aiEvents);

            const result = await service.getDialogs('channel-001');

            expect(result).toEqual([]);
        });

        it('should throw HttpException on error', async () => {
            mockAiEventsRepository.findAll.mockRejectedValue(new Error('DB error'));

            await expect(service.getDialogs('channel-001'))
                .rejects
                .toThrow(HttpException);
        });
    });

    describe('preview journal real service query', () => {
        it('preserves tenant and ISO interval while forwarding union selections to the repository', async () => {
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);
            await service.get({ page: 2, limit: 20, search: '', userId: 'foreign', startDate: '2026-10-24T17:00:00Z', endDate: '2026-10-25T16:59:59.999Z', sources: '["call","external-api"]', callTypes: '["incoming","outgoing"]', people: '[{"userId":"99","operatorId":"218"},{"userId":"foreign","operatorId":"218"}]' } as any, false, '99', true);
            const query = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(query.where.userId).toBe('99');
            expect(query.offset).toBe(20);
            expect(query.where.createdAt[Op.gte].toISOString()).toBe('2026-10-24T17:00:00.000Z');
            expect(query.where.createdAt[Op.lte].toISOString()).toBe('2026-10-25T16:59:59.999Z');
            expect(query.where[Op.and]).toHaveLength(3);
        });
        it('reads only distinct scoped identities for filter options', async () => {
            mockAiCdrRepository.findAll.mockResolvedValue([{ userId: '99', operatorId: '218', assistantName: 'Operator' }]);
            const options = await service.getJournalOptions({ userId: 'other', startDate: '2026-10-25T00:00:00Z' } as any, false, '99');
            expect(mockAiCdrRepository.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: '99' }), attributes: ['userId', 'operatorId', 'assistantId', 'assistantName'], limit: 1000 }));
            expect(JSON.parse(options.people[0].value)).toEqual({ userId: '99', operatorId: '218' });
        });
        it('does not add historical identities or robots without calls in the selection', async () => {
            mockAiCdrRepository.findAll.mockResolvedValueOnce([]);
            mockAssistantRepository.findAll.mockResolvedValue([{ id: 7, userId: '99', name: 'No calls' }]);
            const result = await service.getJournalOptions({ userId: 'foreign', startDate: '2026-10-25' } as any, false, '99');
            expect(result.people).toEqual([]);
            expect(mockAiCdrRepository.findAll).toHaveBeenCalledTimes(1);
            expect(mockAssistantRepository.findAll).not.toHaveBeenCalled();
            expect(mockAiCdrRepository.findAll.mock.calls[0][0].where.userId).toBe('99');
        });
        it('requires an authenticated tenant and allows only admins to select another account', async () => {
            await expect(service.getJournalOptions({ userId: 'foreign' } as any, false, null)).rejects.toThrow('Missing account');
            mockAiCdrRepository.findAll.mockResolvedValue([]);
            await service.getJournalOptions({ userId: '100' } as any, true, null);
            expect(mockAiCdrRepository.findAll.mock.calls[0][0].where.userId).toBe('100');
        });
        it('uses an escaped tenant-scoped tag subquery instead of truncating at5000IDs', async () => {
            const orm = new Sequelize({ dialect: 'postgres', database: 'unused', username: 'unused', password: 'unused', logging: false });
            mockAiCdrRepository.sequelize.getQueryInterface = () => orm.getQueryInterface();
            mockCallTagRepository.getTableName = () => 'operator_call_tags';
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);
            await service.get({ page: 1, limit: 20, search: '', userId: 'foreign', tagId: "service'quote" } as any, false, '99', true);
            const clause = mockAiCdrRepository.findAndCountAll.mock.calls[0][0].where.channelId[Op.in].val;
            expect(clause).toContain("service''quote");
            expect(clause).toContain("'99'");
            expect(clause).not.toContain('LIMIT');
            expect(mockCallTagRepository.findAll).not.toHaveBeenCalled();
            await orm.close();
        });
        it('builds an OR topic union inside the authenticated account subquery', async () => {
            const orm = new Sequelize({dialect:'postgres',database:'unused',username:'unused',password:'unused',logging:false});
            mockAiCdrRepository.sequelize.getQueryInterface=()=>orm.getQueryInterface();mockCallTagRepository.getTableName=()=> 'operator_call_tags';
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({count:0,rows:[]});mockAiCdrRepository.sum.mockResolvedValue(0);
            await service.get({page:1,limit:20,search:'',userId:'foreign',tagIds:JSON.stringify(['booking','service'])} as any,false,'99',true,true);
            const scope=mockAiCdrRepository.findAndCountAll.mock.calls[0][0].where;
            expect(scope.userId).toBe('99');expect(scope.channelId[Op.in].val).toContain("IN ('booking', 'service')");expect(scope.channelId[Op.in].val).toContain("'99'");await orm.close();
        });
        it('rejects unbounded pagination before querying', async () => {
            await expect(service.get({ page: 1, limit: 100000, search: '' } as any, false, '99', true)).rejects.toThrow();
            expect(mockAiCdrRepository.findAndCountAll).not.toHaveBeenCalled();
        });
    });

    // ─── get (CDR listing with pagination) ──────────────────────────────

    describe('get', () => {
        it.each(['qualityScore', 'topic', 'scenarioSuccess'])('sorts the complete journal by %s while keeping legacy fallback unchanged', async (sortField) => {
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            await service.get({ page: 1, limit: 20, search: '', sortField, sortOrder: 'ASC' } as any, false, '99', true, true);
            let options = mockAiCdrRepository.findAndCountAll.mock.calls.at(-1)[0];
            expect(options.subQuery).toBe(false);
            expect(options.where.userId).toBe('99');
            expect(options.order[0][0].val).toContain('ASC NULLS LAST');
            if (sortField !== 'scenarioSuccess') {
                await service.get({ page: 1, limit: 20, search: '', sortField, sortOrder: 'ASC' } as any, false, '99');
                options = mockAiCdrRepository.findAndCountAll.mock.calls.at(-1)[0];
                expect(options.order[0]).toEqual(['createdAt', 'ASC']);
            }
        });
        const baseQuery = {
            page: 1,
            limit: 10,
            search: '',
            userId: '1',
        };

        it('should return paginated CDR records with totalCost', async () => {
            const rows = [mockCdrRecord];
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 1, rows });
            mockAiCdrRepository.sum.mockResolvedValue(0.05);

            const result = await service.get(baseQuery as any, false, '1');

            expect(result.count).toBe(1);
            expect(result.totalCost).toBe(0.05);
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0]).toEqual(expect.objectContaining({
                channelId: 'channel-001',
                transcription: null,
            }));
        });

        it('should apply search filter by callerId and assistantName', async () => {
            const query = { ...baseQuery, search: 'Bot' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            expect(mockAiCdrRepository.findAndCountAll).toHaveBeenCalledTimes(1);
            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            // Verify that an OR clause exists in the where (Op symbols are not JSON-serializable)
            const whereKeys = Object.getOwnPropertySymbols(callArgs.where);
            expect(whereKeys.length).toBeGreaterThan(0);
        });

        it('should apply date range filter when both startDate and endDate are provided', async () => {
            const query = { ...baseQuery, startDate: '2026-02-01', endDate: '2026-02-13' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.createdAt).toBeDefined();
        });

        it('should filter by assistantId when provided as comma-separated string', async () => {
            const query = { ...baseQuery, assistantId: '1,2,3' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.assistantId).toBeDefined();
        });

        it('should filter by tagId within tenant scope', async () => {
            mockCallTagRepository.findAll.mockResolvedValue([
                { channelId: '42' },
                { channelId: '99' },
            ]);
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get({ ...baseQuery, tagId: 'returns' } as any, false, '1');

            expect(mockCallTagRepository.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { tagId: 'returns', userId: '1' },
            }));
            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.channelId).toEqual({ [Op.in]: ['42', '99'] });
        });

        it('should return nothing when tagId matches no rows', async () => {
            mockCallTagRepository.findAll.mockResolvedValue([]);
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get({ ...baseQuery, tagId: 'missing' } as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.channelId).toEqual({ [Op.in]: ['__no_matching_tag__'] });
        });

        it('admin should see all records when no userId is set', async () => {
            const query = { ...baseQuery, userId: '' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 5, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(1.5);

            const result = await service.get(query as any, true, 'admin-1');

            expect(result.count).toBe(5);
            // userId should not be in whereClause
            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.userId).toBeUndefined();
        });

        it('non-admin should always use realUserId', async () => {
            const query = { ...baseQuery, userId: '999' }; // tries to set another userId
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 1, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.where.userId).toBe('1'); // realUserId is used, not query.userId
        });

        it('should throw when non-admin has no realUserId', async () => {
            await expect(service.get(baseQuery as any, false, ''))
                .rejects
                .toThrow(HttpException);
        });

        it('should return totalCost as 0 when sum returns null', async () => {
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(null);

            const result = await service.get(baseQuery as any, false, '1');

            expect(result.totalCost).toBe(0);
        });

        it('should compute correct offset for pagination', async () => {
            const query = { ...baseQuery, page: 3, limit: 5 };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.offset).toBe(10); // (3 - 1) * 5
            expect(callArgs.limit).toBe(5);
        });

        it('should sort by csat without distinct (postgres-compatible order)', async () => {
            const query = { ...baseQuery, sortField: 'csat', sortOrder: 'ASC' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.distinct).toBeUndefined();
            expect(callArgs.subQuery).toBe(false);
            expect(callArgs.order[0][0].val).toContain('"analytics"."csat" ASC NULLS LAST');
            const billingInclude = callArgs.include.find((item: { as: string }) => item.as === 'billingRecords');
            expect(billingInclude.separate).toBe(true);
        });

        it('should sort direct columns by aiCdr field', async () => {
            const query = { ...baseQuery, sortField: 'cost', sortOrder: 'DESC' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.order).toEqual([['cost', 'DESC'], ['id', 'DESC']]);
            expect(callArgs.distinct).toBeUndefined();
        });

        it('should fall back to createdAt for unknown sortField', async () => {
            const query = { ...baseQuery, sortField: 'invalid', sortOrder: 'ASC' };
            mockAiCdrRepository.findAndCountAll.mockResolvedValue({ count: 0, rows: [] });
            mockAiCdrRepository.sum.mockResolvedValue(0);

            await service.get(query as any, false, '1');

            const callArgs = mockAiCdrRepository.findAndCountAll.mock.calls[0][0];
            expect(callArgs.order).toEqual([['createdAt', 'ASC'], ['id', 'ASC']]);
        });
    });

    // ─── getDashboardData ───────────────────────────────────────────────

    describe('getDashboardData', () => {
        const baseDashboardQuery = {
            startDate: '2026-02-01',
            endDate: '2026-02-13',
            userId: '1',
        };

        const mockChartData = [
            { label: '2026-02-01', allCount: 5, tokensCount: 1000, durationCount: 300, amount: 0.5 },
            { label: '2026-02-02', allCount: 3, tokensCount: 800, durationCount: 200, amount: 0.3 },
        ];

        const mockTotalData = [{
            allCount: 8,
            allTokensCount: 1800,
            allDurationCount: 500,
            allCost: 0.8,
        }];

        it('should return chart data and totals', async () => {
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce(mockChartData)
                .mockResolvedValueOnce(mockTotalData);

            const result = await service.getDashboardData(baseDashboardQuery as any, false);

            expect(result.chartData).toEqual(mockChartData);
            expect(result.allCount).toBe(8);
            expect(result.allTokensCount).toBe(1800);
            expect(result.allDurationCount).toBe(500);
            expect(result.allCost).toBe(0.8);
        });

        it('should throw when startDate is missing', async () => {
            const query = { ...baseDashboardQuery, startDate: '' };

            await expect(service.getDashboardData(query as any, false))
                .rejects
                .toThrow(HttpException);
        });

        it('should throw when endDate is missing', async () => {
            const query = { ...baseDashboardQuery, endDate: '' };

            await expect(service.getDashboardData(query as any, false))
                .rejects
                .toThrow(HttpException);
        });

        it('should use GROUP BY DAY for ranges <= 31 days', async () => {
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(baseDashboardQuery as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('"createdAt"::date');
            expect(periodQuery).toContain('GROUP BY "createdAt"::date');
        });

        it('should use GROUP BY MONTH for ranges > 31 days', async () => {
            const query = { ...baseDashboardQuery, startDate: '2026-01-01', endDate: '2026-03-15' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain("TO_CHAR(\"createdAt\", 'YYYY-MM')");
        });

        it('should use GROUP BY YEAR for ranges > 366 days', async () => {
            const query = { ...baseDashboardQuery, startDate: '2024-01-01', endDate: '2026-02-13' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain("TO_CHAR(\"createdAt\", 'YYYY')");
        });

        it('should include userId filter in query for non-admin', async () => {
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(baseDashboardQuery as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('"userId" = \'1\'');
        });

        it('admin without userId should not include userId filter', async () => {
            const query = { startDate: '2026-02-01', endDate: '2026-02-13' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, true);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).not.toContain('userId =');
        });

        it('should include assistantId filter when provided', async () => {
            const query = { ...baseDashboardQuery, assistantId: '5' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('"assistantId" IN (5)');
        });

        it('should handle nullish totals gracefully', async () => {
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: null, allTokensCount: null, allDurationCount: null, allCost: null }]);

            const result = await service.getDashboardData(baseDashboardQuery as any, false);

            expect(result.allCount).toBe(0);
            expect(result.allTokensCount).toBe(0);
            expect(result.allDurationCount).toBe(0);
            expect(result.allCost).toBe(0);
        });
    });

    // ─── deleteReport ───────────────────────────────────────────────────

    describe('deleteReport', () => {
        it('should refund billing and delete related records for admin', async () => {
            mockAiCdrRepository.findByPk.mockResolvedValue({
                ...mockCdrRecord,
                id: 2416,
                channelId: '55',
                userId: '1',
                cost: 0.12,
                source: 'external-api',
                destroy: jest.fn().mockResolvedValue(undefined),
            });

            const result = await service.deleteReport('2416', true);

            expect(mockBillingService.refundBillingForChannel).toHaveBeenCalledWith('55', '1', {
                externalId: 'refund_report_2416',
                transaction: expect.anything(),
                fallbackUsd: 0.12,
            });
            expect(result).toEqual({ success: true, id: '2416', refundedUsd: 0.08 });
        });

        it('should reject non-admin delete', async () => {
            await expect(service.deleteReport('2416', false))
                .rejects
                .toThrow(new HttpException('Forbidden', HttpStatus.FORBIDDEN));
        });
    });
});
