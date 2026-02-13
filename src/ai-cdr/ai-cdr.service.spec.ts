import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AiCdrService } from './ai-cdr.service';
import { AiCdr } from './ai-cdr.model';
import { AiEvents } from './ai-events.model';
import { Assistant } from '../assistants/assistants.model';
import { BillingService } from '../billing/billing.service';
import { AiAnalyticsService } from '../ai-analytics/ai-analytics.service';

describe('AiCdrService', () => {
    let service: AiCdrService;
    let mockAiCdrRepository: any;
    let mockAiEventsRepository: any;
    let mockAssistantRepository: any;
    let mockBillingService: any;
    let mockAiAnalyticsService: any;
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
            createdAt: '2026-02-13T10:00:00.000Z',
            update: jest.fn().mockResolvedValue(undefined),
        };

        mockAiCdrRepository = {
            create: jest.fn(),
            findOne: jest.fn(),
            findAndCountAll: jest.fn(),
            sum: jest.fn(),
            sequelize: {
                query: jest.fn(),
            },
        };

        mockAiEventsRepository = {
            create: jest.fn(),
            findAll: jest.fn(),
        };

        mockAssistantRepository = {
            findOne: jest.fn(),
            findByPk: jest.fn(),
        };

        mockBillingService = {
            finalizeCallBilling: jest.fn().mockResolvedValue({ totalCost: 0.05 }),
        };

        mockAiAnalyticsService = {
            analyzeCall: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiCdrService,
                { provide: getModelToken(AiCdr), useValue: mockAiCdrRepository },
                { provide: getModelToken(AiEvents), useValue: mockAiEventsRepository },
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
            mockAiCdrRepository.create.mockResolvedValue(mockCdrRecord);

            const result = await service.cdrCreate(mockCdrDto);

            expect(mockAiCdrRepository.create).toHaveBeenCalledWith(mockCdrDto);
            expect(result).toEqual(mockCdrRecord);
        });

        it('should throw HttpException when channelId already exists (unique constraint)', async () => {
            const uniqueError = new Error('Unique constraint violated');
            uniqueError.name = 'SequelizeUniqueConstraintError';
            mockAiCdrRepository.create.mockRejectedValue(uniqueError);

            await expect(service.cdrCreate(mockCdrDto))
                .rejects
                .toThrow(new HttpException('AiCdr already exists', HttpStatus.BAD_REQUEST));
        });

        it('should throw HttpException on generic database error', async () => {
            mockAiCdrRepository.create.mockRejectedValue(new Error('DB connection lost'));

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

    // ─── get (CDR listing with pagination) ──────────────────────────────

    describe('get', () => {
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
            expect(result.rows).toEqual(rows);
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
            expect(periodQuery).toContain('DAY(createdAt)');
            expect(periodQuery).toContain("DATE(createdAt) as label");
        });

        it('should use GROUP BY MONTH for ranges > 31 days', async () => {
            const query = { ...baseDashboardQuery, startDate: '2026-01-01', endDate: '2026-03-15' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('MONTH(createdAt)');
        });

        it('should use GROUP BY YEAR for ranges > 366 days', async () => {
            const query = { ...baseDashboardQuery, startDate: '2024-01-01', endDate: '2026-02-13' };
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(query as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('YEAR(createdAt)');
        });

        it('should include userId filter in query for non-admin', async () => {
            mockAiCdrRepository.sequelize.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ allCount: 0, allTokensCount: 0, allDurationCount: 0, allCost: 0 }]);

            await service.getDashboardData(baseDashboardQuery as any, false);

            const periodQuery = mockAiCdrRepository.sequelize.query.mock.calls[0][0];
            expect(periodQuery).toContain('userId = 1');
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
            expect(periodQuery).toContain('assistantId IN (5)');
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
});
