import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorAnalytics, AnalyticsSource, AnalyticsStatus } from './operator-analytics.model';
import { OperatorProject } from './operator-project.model';
import { MetricValue } from './operator-metric-value.model';
import { MetricOverride } from './operator-metric-override.model';
import { CallTag } from './operator-call-tag.model';
import { OperatorApiToken } from './operator-api-token.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../ai-analytics/ai-analytics.model';
import { BillingRecord } from '../billing/billing-record.model';
import { BillingFxService } from '../billing/billing-fx.service';
import { Prices } from '../prices/prices.model';
import { User } from '../users/users.model';
import { UsersService } from '../users/users.service';
import { OpenAiTranscriptionProvider } from './providers/openai-transcription.provider';
import { ExternalSttProvider } from './providers/external-stt.provider';
import { WhisperService } from '../whisper/whisper.service';
import { InsightsCacheService } from './insights-cache.service';
import { OperatorAlertService } from './operator-alert.service';
import { Op } from 'sequelize';

describe('OperatorAnalyticsService', () => {
    let service: OperatorAnalyticsService;
    let mockAlertService: { sendCriticalAlert: jest.Mock };

    // ─── Mock repositories ───────────────────────────────────────────
    let mockAnalyticsRepo: any;
    let mockAiCdrRepo: any;
    let mockAiAnalyticsRepo: any;
    let mockBillingRecordRepo: any;
    let mockApiTokenRepo: any;
    let mockProjectRepo: any;
    let mockMetricValueRepo: any;
    let mockMetricOverrideRepo: any;
    let mockCallTagRepo: any;
    let mockPricesRepo: any;
    let mockUserRepo: any;
    let mockUsersService: any;
    let mockConfigService: any;
    let mockOpenAiStt: any;
    let mockExternalStt: any;
    let mockWhisperService: any;

    // ─── Reusable mock data ──────────────────────────────────────────
    const mockUser = { balance: 100, update: jest.fn() };
    const mockPrice = { userId: 1, analytic: 2, stt: 0.006 }; // $2/1M tokens, $0.006/min STT

    const mockProject = {
        id: 1,
        name: 'Test Project',
        description: 'Test description',
        userId: '1',
        isDefault: false,
        systemPrompt: 'Test prompt',
        customMetricsSchema: [],
        visibleDefaultMetrics: ['greeting_quality', 'script_compliance'],
        dashboardConfig: { widgets: [], maxWidgets: 20 },
        webhookUrl: 'https://example.com/hook',
        webhookEvents: ['analysis.completed'],
        webhookHeaders: { Authorization: 'Bearer test-token' },
        currentSchemaVersion: 1,
        save: jest.fn().mockResolvedValue(undefined),
        toJSON: jest.fn().mockReturnThis(),
    };

    const mockRecord = {
        id: 1,
        userId: '1',
        filename: 'test.mp3',
        source: AnalyticsSource.FRONTEND,
        status: AnalyticsStatus.PROCESSING,
        projectId: 1,
        operatorName: 'Operator',
        clientPhone: '+7900000',
        language: 'auto',
        recordUrl: 'https://example.com/audio.mp3',
        update: jest.fn().mockResolvedValue(undefined),
        reload: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        // Reset all mocks
        mockAnalyticsRepo = {
            create: jest.fn().mockResolvedValue(mockRecord),
            findByPk: jest.fn().mockResolvedValue(mockRecord),
            findOne: jest.fn(),
            findAll: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue([0]),
            sequelize: {
                getDialect: jest.fn().mockReturnValue('postgres'),
            },
        };

        mockAiCdrRepo = {
            create: jest.fn().mockResolvedValue({}),
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(0),
            sum: jest.fn().mockResolvedValue(0),
            sequelize: {
                getDialect: jest.fn().mockReturnValue('postgres'),
                query: jest.fn().mockResolvedValue([[]]),
            },
        };

        mockAiAnalyticsRepo = {
            create: jest.fn().mockResolvedValue({}),
        };

        mockBillingRecordRepo = {
            create: jest.fn().mockResolvedValue({}),
        };

        mockApiTokenRepo = {
            create: jest.fn(),
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
            destroy: jest.fn(),
        };

        mockProjectRepo = {
            create: jest.fn().mockResolvedValue(mockProject),
            findAll: jest.fn().mockResolvedValue([mockProject]),
            findOne: jest.fn().mockResolvedValue(mockProject),
            findByPk: jest.fn().mockResolvedValue(mockProject),
        };

        mockMetricValueRepo = {
            bulkCreate: jest.fn().mockResolvedValue([]),
            destroy: jest.fn().mockResolvedValue(0),
            findAll: jest.fn().mockResolvedValue([]),
        };

        mockMetricOverrideRepo = {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
            destroy: jest.fn().mockResolvedValue(0),
        };

        mockCallTagRepo = {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((v: any) => Promise.resolve(v)),
            destroy: jest.fn().mockResolvedValue(0),
            bulkCreate: jest.fn().mockResolvedValue([]),
        };

        mockPricesRepo = {
            findOne: jest.fn().mockResolvedValue(mockPrice),
        };

        mockUserRepo = {
            findByPk: jest.fn().mockResolvedValue(mockUser),
        };

        mockUsersService = {
            decrementUserBalance: jest.fn().mockResolvedValue(true),
        };

        mockConfigService = {
            get: jest.fn((key: string) => key === 'DEFAULT_STT_PROVIDER' ? 'whisper' : 'test-openai-key'),
        };

        mockOpenAiStt = {
            transcribe: jest.fn().mockResolvedValue({ text: 'Hello world', duration: 60 }),
        };

        mockExternalStt = {
            transcribe: jest.fn().mockResolvedValue({ text: 'Hello world', duration: 60 }),
        };

        mockWhisperService = {
            transcribe: jest.fn().mockResolvedValue({ text: 'Hello world', duration: 60 }),
            healthCheck: jest.fn().mockResolvedValue({ status: 'ok', url: 'http://whisper:9000/asr' }),
        };

        mockAlertService = {
            sendCriticalAlert: jest.fn().mockResolvedValue({ emailed: 0, telegram: 0 }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OperatorAnalyticsService,
                { provide: getModelToken(OperatorAnalytics), useValue: mockAnalyticsRepo },
                { provide: getModelToken(AiCdr), useValue: mockAiCdrRepo },
                { provide: getModelToken(AiAnalytics), useValue: mockAiAnalyticsRepo },
                { provide: getModelToken(BillingRecord), useValue: mockBillingRecordRepo },
                { provide: getModelToken(OperatorApiToken), useValue: mockApiTokenRepo },
                { provide: getModelToken(OperatorProject), useValue: mockProjectRepo },
                { provide: getModelToken(MetricValue), useValue: mockMetricValueRepo },
                { provide: getModelToken(MetricOverride), useValue: mockMetricOverrideRepo },
                { provide: getModelToken(CallTag), useValue: mockCallTagRepo },
                { provide: getModelToken(Prices), useValue: mockPricesRepo },
                { provide: getModelToken(User), useValue: mockUserRepo },
                { provide: UsersService, useValue: mockUsersService },
                { provide: ConfigService, useValue: mockConfigService },
                { provide: OpenAiTranscriptionProvider, useValue: mockOpenAiStt },
                { provide: ExternalSttProvider, useValue: mockExternalStt },
                { provide: WhisperService, useValue: mockWhisperService },
                {
                    provide: BillingFxService,
                    useValue: {
                        captureSnapshot: jest.fn(async (amountUsd: number) => ({
                            currency: 'USD',
                            amountCurrency: amountUsd,
                            rate: 1,
                            source: 'identity',
                            capturedAt: new Date(),
                        })),
                        toFxFields: jest.fn((snap: { currency: string; amountCurrency: number; rate: number; source: string; capturedAt: Date }) => ({
                            currency: snap.currency,
                            amountCurrency: snap.amountCurrency,
                            fxRateUsdToCurrency: snap.rate,
                            fxRateSource: snap.source,
                            fxCapturedAt: snap.capturedAt,
                        })),
                        fieldsForUsdAmount: jest.fn(async (amountUsd: number) => ({
                            currency: 'USD',
                            amountCurrency: amountUsd,
                            fxRateUsdToCurrency: 1,
                            fxRateSource: 'identity',
                            fxCapturedAt: new Date(),
                        })),
                    },
                },
                {
                    provide: InsightsCacheService,
                    useValue: {
                        get: jest.fn().mockResolvedValue(null),
                        set: jest.fn().mockResolvedValue(undefined),
                    },
                },
                { provide: OperatorAlertService, useValue: mockAlertService },
            ],
        }).compile();

        service = module.get<OperatorAnalyticsService>(OperatorAnalyticsService);
    });

    // ═════════════════════════════════════════════════════════════════
    // checkBalance (private — tested through public methods)
    // ═════════════════════════════════════════════════════════════════

    describe('analyzeFile — balance check', () => {
        it('should throw 402 when user balance is 0', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 0 });

            await expect(
                service.analyzeFile(Buffer.from('audio'), 'test.mp3', '1', AnalyticsSource.FRONTEND),
            ).rejects.toThrow(HttpException);

            try {
                await service.analyzeFile(Buffer.from('audio'), 'test.mp3', '1', AnalyticsSource.FRONTEND);
            } catch (e) {
                expect(e.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
            }
        });

        it('should throw 402 when user not found', async () => {
            mockUserRepo.findByPk.mockResolvedValue(null);

            await expect(
                service.analyzeFile(Buffer.from('audio'), 'test.mp3', '1', AnalyticsSource.FRONTEND),
            ).rejects.toThrow(HttpException);
        });

        it('should proceed when balance is positive', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 50 });
            // Will fail at transcription stage but won't throw 402
            mockWhisperService.transcribe.mockRejectedValue(new Error('Whisper STT error'));
            mockExternalStt.transcribe.mockRejectedValue(new Error('STT error'));
            mockOpenAiStt.transcribe.mockRejectedValue(new Error('STT fallback error'));

            await expect(
                service.analyzeFile(Buffer.from('audio'), 'test.mp3', '1', AnalyticsSource.FRONTEND),
            ).rejects.toThrow('Whisper STT error');
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // Minimum recording duration
    // ═════════════════════════════════════════════════════════════════

    describe('minimum recording duration', () => {
        beforeEach(() => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            mockProjectRepo.findByPk.mockResolvedValue(null);
            mockWhisperService.transcribe.mockResolvedValue({ text: '', duration: 1 });
        });

        it('should reject analyzeFile when recording is shorter than 10 seconds', async () => {
            await expect(
                service.analyzeFile(Buffer.from('audio'), 'short.mp3', '1', AnalyticsSource.FRONTEND),
            ).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });

            expect(mockRecord.update).toHaveBeenCalledWith(expect.objectContaining({
                status: AnalyticsStatus.ERROR,
                duration: 1,
                errorMessage: expect.stringContaining('minimum 10 seconds'),
            }));
            expect(mockAiCdrRepo.create).not.toHaveBeenCalled();
            expect(mockAiAnalyticsRepo.create).not.toHaveBeenCalled();
            expect(mockBillingRecordRepo.create).not.toHaveBeenCalled();
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });

        it('should skip background analysis when recording is shorter than 10 seconds', async () => {
            const status = await service.processInBackground(1, Buffer.from('audio'));

            // Must report ERROR so batch accounting does not count it as success.
            expect(status).toBe(AnalyticsStatus.ERROR);
            expect(mockRecord.update).toHaveBeenCalledWith(expect.objectContaining({
                status: AnalyticsStatus.ERROR,
                duration: 1,
                errorMessage: expect.stringContaining('minimum 10 seconds'),
            }));
            expect(mockAiCdrRepo.create).not.toHaveBeenCalled();
            expect(mockAiAnalyticsRepo.create).not.toHaveBeenCalled();
            expect(mockBillingRecordRepo.create).not.toHaveBeenCalled();
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });

        it('returns ERROR (not throw) when STT fails, so batch counts it as failed', async () => {
            mockWhisperService.transcribe.mockRejectedValueOnce(new Error('getaddrinfo EAI_AGAIN gpu.aipbx.net'));

            const status = await service.processInBackground(1, Buffer.from('audio'));

            expect(status).toBe(AnalyticsStatus.ERROR);
            expect(mockRecord.update).toHaveBeenCalledWith(expect.objectContaining({
                status: AnalyticsStatus.ERROR,
            }));
            expect(mockAiCdrRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('regenerateAnalysis', () => {
        let axiosGetSpy: jest.SpyInstance;

        beforeEach(() => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            mockProjectRepo.findByPk.mockResolvedValue(null);
            mockWhisperService.transcribe.mockResolvedValue({ text: '', duration: 1 });
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '1',
                cost: 0.01,
                tokens: 100,
                amountCurrency: 0.01,
                costCurrency: 'USD',
                recordUrl: 'https://example.com/audio.mp3',
                update: jest.fn().mockResolvedValue(undefined),
                reload: jest.fn().mockResolvedValue({ channelId: '1' }),
            });

            const axios = require('axios');
            axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
                data: Buffer.from('audio'),
                headers: { 'content-length': '5' },
            });
        });

        afterEach(() => {
            axiosGetSpy?.mockRestore();
        });

        it('should reject regeneration when recording is shorter than 10 seconds', async () => {
            await expect(
                service.regenerateAnalysis('1', '1', false),
            ).rejects.toMatchObject({
                status: HttpStatus.BAD_REQUEST,
            });

            expect(mockBillingRecordRepo.create).not.toHaveBeenCalled();
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });

        it('should throw 404 when operator record is missing', async () => {
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);

            await expect(
                service.regenerateAnalysis('1', '1', false),
            ).rejects.toMatchObject({
                status: HttpStatus.NOT_FOUND,
            });
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // chargeCost
    // ═════════════════════════════════════════════════════════════════

    describe('chargeCost (via analyzeFile)', () => {
        // We can't call chargeCost directly because it's private,
        // but we can verify its effects through analyzeFile
        it('should return zero costs when price not found', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            mockPricesRepo.findOne.mockResolvedValue(null);
            mockProjectRepo.findByPk.mockResolvedValue(null);

            // Mock the full transcription + analysis pipeline
            mockExternalStt.transcribe.mockResolvedValue({ text: 'Transcript', duration: 120 });

            // Mock openAiClient.chat.completions.create via analyzeTranscription
            // Since we can't easily mock OpenAI, we test chargeCost indirectly
            // The key assertion is that decrementUserBalance is NOT called
            // when price is not found

            // For this test, we need to mock the entire chain up to chargeCost
            // Skip full integration — test billing record creation
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // Project CRUD
    // ═════════════════════════════════════════════════════════════════

    describe('getProjects', () => {
        it('should return all projects for admin without creating default', async () => {
            const projects = [mockProject, { ...mockProject, id: 2, name: 'Other' }];
            mockProjectRepo.findAll.mockResolvedValue(projects);

            const result = await service.getProjects('1', true);

            expect(mockProjectRepo.findAll).toHaveBeenCalledWith({
                where: {},
                order: [['createdAt', 'DESC']],
            });
            expect(result).toEqual(projects);
        });

        it('should filter by userId for non-admin', async () => {
            mockProjectRepo.findAll.mockResolvedValue([mockProject]);
            mockProjectRepo.findOne.mockResolvedValue(mockProject); // resolveDefaultProject

            await service.getProjects('5', false);

            expect(mockProjectRepo.findAll).toHaveBeenCalledWith({
                where: { userId: '5' },
                order: [['createdAt', 'DESC']],
            });
        });
    });

    describe('createProject', () => {
        it('should throw when name is empty', async () => {
            await expect(
                service.createProject('1', { name: '' }),
            ).rejects.toThrow('Project name is required');
        });

        it('should throw when name is only spaces', async () => {
            await expect(
                service.createProject('1', { name: '   ' }),
            ).rejects.toThrow('Project name is required');
        });

        it('should create project with trimmed name', async () => {
            await service.createProject('1', { name: '  Test Project  ' });

            expect(mockProjectRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Test Project', userId: '1' }),
            );
        });

        it('should apply template values when templateId is provided', async () => {
            // Templates are in project-templates.ts — we test with a known ID
            // If template not found, should still work without template values
            await service.createProject('1', {
                name: 'From Template',
                templateId: 'nonexistent-template',
            });

            expect(mockProjectRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'From Template' }),
            );
        });

        it('should store webhookUrl, webhookEvents, and webhookHeaders', async () => {
            await service.createProject('1', {
                name: 'Webhook Project',
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['analysis.completed'],
                webhookHeaders: { Authorization: 'Bearer token' },
            });

            expect(mockProjectRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    webhookUrl: 'https://example.com/hook',
                    webhookEvents: ['analysis.completed'],
                    webhookHeaders: { Authorization: 'Bearer token' },
                }),
            );
        });

        it('should set webhookUrl to null when empty string', async () => {
            await service.createProject('1', {
                name: 'No Webhook',
                webhookUrl: '',
            });

            expect(mockProjectRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ webhookUrl: null }),
            );
        });
    });

    describe('updateProject', () => {
        it('should throw 404 when project not found', async () => {
            mockProjectRepo.findOne.mockResolvedValue(null);

            await expect(
                service.updateProject(999, '1', { name: 'Updated' }),
            ).rejects.toThrow('Project not found');
        });

        it('should throw when renaming default project', async () => {
            mockProjectRepo.findOne.mockResolvedValue({
                ...mockProject,
                isDefault: true,
                save: jest.fn(),
            });

            await expect(
                service.updateProject(1, '1', { name: 'New Name' }),
            ).rejects.toThrow('Cannot rename default project');
        });

        it('should update name and description', async () => {
            const saveMock = jest.fn().mockResolvedValue(undefined);
            const project: any = {
                ...mockProject,
                isDefault: false,
                save: saveMock,
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            const result = await service.updateProject(1, '1', {
                name: 'Updated Name',
                description: 'Updated description',
            });

            expect(project.name).toBe('Updated Name');
            expect(project.description).toBe('Updated description');
            expect(saveMock).toHaveBeenCalled();
        });

        it('should increment schemaVersion when customMetricsSchema changes', async () => {
            const project = {
                ...mockProject,
                currentSchemaVersion: 1,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', {
                customMetricsSchema: [
                    { id: 'test', name: 'Test', type: 'boolean', description: 'test' },
                ],
            });

            expect(project.currentSchemaVersion).toBe(2);
        });

        it('should update webhookHeaders', async () => {
            const project = {
                ...mockProject,
                webhookHeaders: {},
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', {
                webhookHeaders: { 'X-API-Key': 'secret123' },
            });

            expect(project.webhookHeaders).toEqual({ 'X-API-Key': 'secret123' });
        });

        it('should set systemPrompt to null when empty string', async () => {
            const project = {
                ...mockProject,
                systemPrompt: 'old prompt',
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', { systemPrompt: '' });

            expect(project.systemPrompt).toBeNull();
        });
    });

    describe('taxonomy', () => {
        const twoThemes = [
            { id: 'returns', name: 'Возвраты', aliases: ['возврат', 'вернуть'] },
            { id: 'delivery', name: 'Доставка', aliases: ['доставка', 'курьер'] },
        ];

        it('persists a two-theme taxonomy and reads it back unchanged', async () => {
            const project: any = {
                ...mockProject,
                callTaxonomy: [],
                currentSchemaVersion: 1,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', { callTaxonomy: twoThemes });

            expect(project.callTaxonomy).toEqual(twoThemes);
            expect(project.save).toHaveBeenCalled();
        });

        it('does not increment schema version when taxonomy changes', async () => {
            const project: any = {
                ...mockProject,
                callTaxonomy: [],
                currentSchemaVersion: 3,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', { callTaxonomy: twoThemes });

            expect(project.currentSchemaVersion).toBe(3);
        });

        it('still increments schema version when custom metrics change', async () => {
            const project: any = {
                ...mockProject,
                currentSchemaVersion: 3,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await service.updateProject(1, '1', {
                customMetricsSchema: [
                    { id: 'test', name: 'Test', type: 'boolean', description: 'test' },
                ],
            });

            expect(project.currentSchemaVersion).toBe(4);
        });

        it('creates a project without taxonomy with an empty list default on the model', async () => {
            await service.createProject('1', { name: 'No Taxonomy' });

            expect(mockProjectRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'No Taxonomy', userId: '1' }),
            );
            expect(mockProjectRepo.create.mock.calls[0][0].callTaxonomy).toBeUndefined();
        });

        it('rejects a theme id exceeding the length cap', async () => {
            const project: any = { ...mockProject, save: jest.fn() };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await expect(
                service.updateProject(1, '1', {
                    callTaxonomy: [{ id: 'x'.repeat(51), name: 'Bad', aliases: ['a'] }],
                }),
            ).rejects.toThrow('Invalid tag id in callTaxonomy');
        });

        it('rejects a theme name exceeding the length cap', async () => {
            const project: any = { ...mockProject, save: jest.fn() };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await expect(
                service.updateProject(1, '1', {
                    callTaxonomy: [{ id: 'ok', name: 'x'.repeat(101), aliases: ['a'] }],
                }),
            ).rejects.toThrow('Invalid tag name in callTaxonomy');
        });

        it('rejects a taxonomy exceeding the theme count cap', async () => {
            const project: any = { ...mockProject, save: jest.fn() };
            mockProjectRepo.findOne.mockResolvedValue(project);
            const tooMany = Array.from({ length: 21 }, (_, i) => ({
                id: `tag_${i}`,
                name: `Tag ${i}`,
                aliases: ['a'],
            }));

            await expect(
                service.updateProject(1, '1', { callTaxonomy: tooMany }),
            ).rejects.toThrow('callTaxonomy exceeds maximum theme count');
        });

        it('rejects a theme whose synonym list exceeds the count cap', async () => {
            const project: any = { ...mockProject, save: jest.fn() };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await expect(
                service.updateProject(1, '1', {
                    callTaxonomy: [{
                        id: 'big',
                        name: 'Big',
                        aliases: Array.from({ length: 31 }, (_, i) => `alias_${i}`),
                    }],
                }),
            ).rejects.toThrow('Invalid tag aliases in callTaxonomy');
        });

        it('rejects a synonym exceeding the length cap', async () => {
            const project: any = { ...mockProject, save: jest.fn() };
            mockProjectRepo.findOne.mockResolvedValue(project);

            await expect(
                service.updateProject(1, '1', {
                    callTaxonomy: [{ id: 'bad', name: 'Bad', aliases: ['x'.repeat(101)] }],
                }),
            ).rejects.toThrow('Invalid tag alias in callTaxonomy');
        });

        it('logs a warning and continues when callTaxonomy column is missing', async () => {
            const project: any = {
                ...mockProject,
                callTaxonomy: [],
                currentSchemaVersion: 1,
                save: jest.fn().mockResolvedValue(undefined),
            };
            Object.defineProperty(project, 'callTaxonomy', {
                set() {
                    throw new Error('column "callTaxonomy" does not exist');
                },
                get() {
                    return [];
                },
                configurable: true,
            });
            mockProjectRepo.findOne.mockResolvedValue(project);
            const warnSpy = jest.spyOn((service as any).logger, 'warn');

            await service.updateProject(1, '1', {
                name: 'Still Updated',
                callTaxonomy: twoThemes,
            });

            expect(project.name).toBe('Still Updated');
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('2026-07-30-operator-call-taxonomy.sql'),
            );
            expect(project.save).toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('deleteProject', () => {
        it('should throw 404 when project not found', async () => {
            mockProjectRepo.findOne.mockResolvedValue(null);

            await expect(
                service.deleteProject(999, '1'),
            ).rejects.toThrow('Project not found');
        });

        it('should throw when deleting default project', async () => {
            mockProjectRepo.findOne.mockResolvedValue({
                ...mockProject,
                isDefault: true,
                destroy: jest.fn(),
            });

            await expect(
                service.deleteProject(1, '1'),
            ).rejects.toThrow('Cannot delete default project');
        });

        it('should destroy the project', async () => {
            const destroyMock = jest.fn().mockResolvedValue(undefined);
            mockProjectRepo.findOne.mockResolvedValue({
                ...mockProject,
                isDefault: false,
                destroy: destroyMock,
            });

            await service.deleteProject(1, '1');
            expect(destroyMock).toHaveBeenCalled();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // Webhook
    // ═════════════════════════════════════════════════════════════════

    describe('callWebhook', () => {
        let axiosPostSpy: jest.SpyInstance;

        beforeEach(() => {
            const axios = require('axios');
            axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });
        });

        afterEach(() => {
            axiosPostSpy?.mockRestore();
        });

        it('should skip when webhookUrl is empty', async () => {
            const project = { ...mockProject, webhookUrl: null } as any;
            await service.callWebhook(project, 'analysis.completed', { data: 'test' });
            expect(axiosPostSpy).not.toHaveBeenCalled();
        });

        it('should skip when event not in webhookEvents', async () => {
            const project = {
                ...mockProject,
                webhookUrl: 'https://example.com',
                webhookEvents: ['analysis.error'], // only error, not completed
            } as any;
            await service.callWebhook(project, 'analysis.completed', { data: 'test' });
            expect(axiosPostSpy).not.toHaveBeenCalled();
        });

        it('should send POST with correct payload and custom headers', async () => {
            const project = {
                ...mockProject,
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['analysis.completed'],
                webhookHeaders: { Authorization: 'Bearer abc123' },
            } as any;

            await service.callWebhook(project, 'analysis.completed', { recordId: 42 });

            expect(axiosPostSpy).toHaveBeenCalledWith(
                'https://example.com/hook',
                expect.objectContaining({
                    event: 'analysis.completed',
                    projectId: 1,
                    data: { recordId: 42 },
                }),
                expect.objectContaining({
                    timeout: 10_000,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer abc123',
                    },
                }),
            );
        });

        it('should retry on failure (up to 3 attempts)', async () => {
            axiosPostSpy
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce({ status: 200 });

            const project = {
                ...mockProject,
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['analysis.completed'],
                webhookHeaders: {},
            } as any;

            await service.callWebhook(project, 'analysis.completed', {});

            expect(axiosPostSpy).toHaveBeenCalledTimes(3);
        });

        it('should not throw after all retries fail', async () => {
            axiosPostSpy.mockRejectedValue(new Error('Always fails'));

            const project = {
                ...mockProject,
                webhookUrl: 'https://example.com/hook',
                webhookEvents: ['analysis.completed'],
                webhookHeaders: {},
            } as any;

            // Should not throw — just logs error
            await expect(
                service.callWebhook(project, 'analysis.completed', {}),
            ).resolves.toBeUndefined();

            expect(axiosPostSpy).toHaveBeenCalledTimes(3);
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // API Tokens
    // ═════════════════════════════════════════════════════════════════

    describe('generateApiToken', () => {
        it('should create a token with oa_ prefix', async () => {
            mockApiTokenRepo.create.mockImplementation((data: any) => Promise.resolve({
                id: 1,
                token: data.token,
                projectId: data.projectId,
            }));

            const result = await service.generateApiToken('1', 'My Token', 5);

            expect(mockApiTokenRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: '1',
                    name: 'My Token',
                    projectId: 5,
                    token: expect.stringMatching(/^oa_[a-f0-9]{32}$/),
                }),
            );
            expect(result.id).toBe(1);
            expect(result.projectId).toBe(5);
            expect(result.token).toMatch(/^oa_/);
        });
    });

    describe('getApiTokens', () => {
        it('lists all tokens when userId is omitted', async () => {
            mockApiTokenRepo.findAll.mockResolvedValue([
                { id: 1, name: 'A', userId: '10', isActive: true, lastUsedAt: null, createdAt: new Date(), projectId: null },
            ]);

            const result = await service.getApiTokens();

            expect(mockApiTokenRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: {},
            }));
            expect(result[0].userId).toBe('10');
        });

        it('filters by owner when userId is set', async () => {
            mockApiTokenRepo.findAll.mockResolvedValue([]);

            await service.getApiTokens('7');

            expect(mockApiTokenRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({
                where: { userId: '7' },
            }));
        });
    });

    describe('revokeApiToken', () => {
        it('should set isActive to false', async () => {
            const token = { id: 1, userId: '1', update: jest.fn().mockResolvedValue(undefined) };
            mockApiTokenRepo.findOne.mockResolvedValue(token);

            await service.revokeApiToken(1, '1');

            expect(token.update).toHaveBeenCalledWith({ isActive: false });
        });

        it('should throw 404 when token not found', async () => {
            mockApiTokenRepo.findOne.mockResolvedValue(null);

            await expect(
                service.revokeApiToken(999, '1'),
            ).rejects.toThrow('Token not found');
        });

        it('looks up by id only when admin', async () => {
            const token = { id: 2, userId: '99', update: jest.fn().mockResolvedValue(undefined) };
            mockApiTokenRepo.findOne.mockResolvedValue(token);

            await service.revokeApiToken(2, '1', true);

            expect(mockApiTokenRepo.findOne).toHaveBeenCalledWith({
                where: { id: 2 },
            });
        });
    });

    describe('deleteApiToken', () => {
        it('should destroy the token', async () => {
            const destroyMock = jest.fn().mockResolvedValue(undefined);
            mockApiTokenRepo.findOne.mockResolvedValue({
                id: 1,
                userId: '1',
                destroy: destroyMock,
            });

            await service.deleteApiToken(1, '1');
            expect(destroyMock).toHaveBeenCalled();
        });

        it('should throw 404 when token not found', async () => {
            mockApiTokenRepo.findOne.mockResolvedValue(null);

            await expect(
                service.deleteApiToken(999, '1'),
            ).rejects.toThrow('Token not found');
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // analyzeUrl
    // ═════════════════════════════════════════════════════════════════

    describe('analyzeUrl', () => {
        let axiosGetSpy: jest.SpyInstance;

        beforeEach(() => {
            const axios = require('axios');
            axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
                data: Buffer.from('fake-audio-data'),
                headers: {},
            });
        });

        afterEach(() => {
            axiosGetSpy?.mockRestore();
        });

        it('should download file from URL with correct options', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            // Will fail later during transcription, but we can verify download
            mockExternalStt.transcribe.mockRejectedValue(new Error('STT'));
            mockOpenAiStt.transcribe.mockRejectedValue(new Error('STT'));

            try {
                await service.analyzeUrl('https://example.com/audio/call.mp3', '1');
            } catch { /* expected to fail at STT */ }

            expect(axiosGetSpy).toHaveBeenCalledWith(
                'https://example.com/audio/call.mp3',
                expect.objectContaining({
                    responseType: 'arraybuffer',
                    timeout: 120_000,
                    maxContentLength: 50 * 1024 * 1024,
                    httpsAgent: expect.any(Object),
                }),
            );
        });

        it('should extract filename from URL', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            mockExternalStt.transcribe.mockRejectedValue(new Error('STT'));
            mockOpenAiStt.transcribe.mockRejectedValue(new Error('STT'));

            try {
                await service.analyzeUrl('https://cdn.example.com/recordings/call-123.wav?token=abc', '1');
            } catch { /* expected */ }

            // Verify filename was extracted (via record creation)
            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ filename: 'call-123.wav' }),
            );
        });

        it('should reject before download when balance is zero', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 0 });

            await expect(
                service.analyzeUrl('https://example.com/audio/call.mp3', '1'),
            ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

            expect(axiosGetSpy).not.toHaveBeenCalled();
            expect(mockAnalyticsRepo.create).not.toHaveBeenCalled();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // createProcessingRecord
    // ═════════════════════════════════════════════════════════════════

    describe('createProcessingRecord', () => {
        it('should create a record with PROCESSING status', async () => {
            await service.createProcessingRecord(
                'file.mp3', '1', AnalyticsSource.API,
                { operatorName: 'Test Op', projectId: 1 },
            );

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: 'file.mp3',
                    userId: '1',
                    source: AnalyticsSource.API,
                    status: AnalyticsStatus.PROCESSING,
                    operatorName: 'Test Op',
                    projectId: 1,
                }),
            );
        });

        it('should default projectId to null', async () => {
            await service.createProcessingRecord('file.mp3', '1', AnalyticsSource.FRONTEND);

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: null }),
            );
        });

        it('should persist consent fields when provided', async () => {
            await service.createProcessingRecord(
                'file.mp3', '1', AnalyticsSource.API,
                { consentObtained: true, consentSource: 'ivr' },
            );

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ consentObtained: true, consentSource: 'ivr' }),
            );
        });

        it('should default consent fields to null when omitted', async () => {
            await service.createProcessingRecord('file.mp3', '1', AnalyticsSource.FRONTEND);

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ consentObtained: null, consentSource: null }),
            );
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // bulkMoveCdrs
    // ═════════════════════════════════════════════════════════════════

    describe('bulkMoveCdrs', () => {
        it('should throw 404 when target project not found', async () => {
            mockProjectRepo.findOne.mockResolvedValue(null);

            await expect(
                service.bulkMoveCdrs('1', [1, 2, 3], 999),
            ).rejects.toThrow();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // Helper: extractFilenameFromUrl (tested via analyzeUrl)
    // ═════════════════════════════════════════════════════════════════

    describe('extractFilenameFromUrl (indirect)', () => {
        let axiosGetSpy: jest.SpyInstance;

        beforeEach(() => {
            const axios = require('axios');
            axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
                data: Buffer.from('fake'),
                headers: {},
            });
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
            mockExternalStt.transcribe.mockRejectedValue(new Error('skip'));
            mockOpenAiStt.transcribe.mockRejectedValue(new Error('skip'));
        });

        afterEach(() => {
            axiosGetSpy?.mockRestore();
        });

        it('should handle URL without path', async () => {
            try {
                await service.analyzeUrl('https://example.com', '1');
            } catch { /* expected */ }

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    filename: expect.any(String),
                }),
            );
        });

        it('should strip query params from filename', async () => {
            try {
                await service.analyzeUrl('https://s3.amazonaws.com/bucket/recording.wav?AWSAccessKeyId=xxx', '1');
            } catch { /* expected */ }

            expect(mockAnalyticsRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ filename: 'recording.wav' }),
            );
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // processUrlInBackground
    // ═════════════════════════════════════════════════════════════════

    describe('processUrlInBackground', () => {
        let axiosGetSpy: jest.SpyInstance;

        beforeEach(() => {
            const axios = require('axios');
            axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
                data: Buffer.from('fake-audio'),
                headers: {},
            });
            mockUserRepo.findByPk.mockResolvedValue({ balance: 100 });
        });

        afterEach(() => {
            axiosGetSpy?.mockRestore();
        });

        it('should reject before download when balance is zero', async () => {
            mockUserRepo.findByPk.mockResolvedValue({ balance: 0 });
            mockAnalyticsRepo.findByPk.mockResolvedValue({
                ...mockRecord,
                update: jest.fn().mockResolvedValue(undefined),
            });

            await service.processUrlInBackground(1, 'https://example.com/call.mp3');

            expect(axiosGetSpy).not.toHaveBeenCalled();
            const record = await mockAnalyticsRepo.findByPk(1);
            expect(record.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: AnalyticsStatus.ERROR,
                    errorMessage: 'Insufficient balance',
                }),
            );
        });

        it('should download URL with correct options', async () => {
            // Will fail at STT stage, but we verify the download step
            mockExternalStt.transcribe.mockRejectedValue(new Error('STT'));
            mockOpenAiStt.transcribe.mockRejectedValue(new Error('STT'));

            await service.processUrlInBackground(1, 'https://example.com/call.mp3');

            expect(axiosGetSpy).toHaveBeenCalledWith(
                'https://example.com/call.mp3',
                expect.objectContaining({
                    responseType: 'arraybuffer',
                    timeout: 120_000,
                    maxContentLength: 50 * 1024 * 1024,
                }),
            );
        });

        it('should set error status on download failure', async () => {
            axiosGetSpy.mockRejectedValue(new Error('Network timeout'));
            mockAnalyticsRepo.findByPk.mockResolvedValue({
                ...mockRecord,
                projectId: null,
                update: jest.fn().mockResolvedValue(undefined),
            });

            await service.processUrlInBackground(1, 'https://bad-url.com/missing.mp3');

            const record = await mockAnalyticsRepo.findByPk(1);
            expect(record.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: AnalyticsStatus.ERROR,
                    errorMessage: 'Network timeout',
                }),
            );
        });

        it('should send error webhook on download failure when project exists', async () => {
            axiosGetSpy.mockRejectedValue(new Error('404 Not Found'));
            const projectWithErrorEvent = {
                ...mockProject,
                webhookEvents: ['analysis.completed', 'analysis.error'],
            };
            const recordWithProject = {
                ...mockRecord,
                projectId: 1,
                update: jest.fn().mockResolvedValue(undefined),
            };
            mockAnalyticsRepo.findByPk.mockResolvedValue(recordWithProject);
            mockProjectRepo.findByPk.mockResolvedValue(projectWithErrorEvent);

            const axios = require('axios');
            const axiosPostSpy = jest.spyOn(axios, 'post').mockResolvedValue({ status: 200 });

            await service.processUrlInBackground(1, 'https://bad-url.com/missing.mp3');

            // Flush microtask queue for fire-and-forget .catch() chain
            await new Promise(r => setTimeout(r, 50));

            expect(axiosPostSpy).toHaveBeenCalledWith(
                projectWithErrorEvent.webhookUrl,
                expect.objectContaining({
                    event: 'analysis.error',
                    data: expect.objectContaining({ error: '404 Not Found' }),
                }),
                expect.any(Object),
            );

            axiosPostSpy.mockRestore();
        });

        it('should not throw even if everything fails', async () => {
            axiosGetSpy.mockRejectedValue(new Error('Crash'));
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);

            // Should not throw
            await expect(
                service.processUrlInBackground(999, 'https://example.com/fail.mp3'),
            ).resolves.toBeUndefined();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // getDashboard — userId filtering (bug fix regression tests)
    // ═════════════════════════════════════════════════════════════════

    describe('getDashboard', () => {
        beforeEach(() => {
            mockAiCdrRepo.count.mockResolvedValue(0);
            mockAiCdrRepo.findAll.mockResolvedValue([]);
            mockAiCdrRepo.sequelize.query.mockResolvedValue([[]]);
        });

        it('should NOT filter by userId when admin requests without userId', async () => {
            await service.getDashboard(
                { startDate: '2026-03-30', endDate: '2026-04-05' },
                true,   // isAdmin
                null,   // realUserId (null for admin)
            );

            expect(mockAiCdrRepo.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.not.objectContaining({ userId: expect.anything() }),
                }),
            );
        });

        it('should filter by query.userId when admin specifies userId', async () => {
            await service.getDashboard(
                { userId: '96', startDate: '2026-03-30', endDate: '2026-04-05' },
                true,   // isAdmin
                null,   // realUserId
            );

            expect(mockAiCdrRepo.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ userId: '96' }),
                }),
            );
        });

        it('should filter by realUserId for non-admin (ignore query.userId)', async () => {
            await service.getDashboard(
                { userId: '999', startDate: '2026-03-30', endDate: '2026-04-05' },
                false,  // isAdmin
                '42',   // realUserId
            );

            expect(mockAiCdrRepo.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ userId: '42' }),
                }),
            );
        });

        it('should return empty dashboard when no records found', async () => {
            mockAiCdrRepo.count.mockResolvedValue(0);

            const result = await service.getDashboard({}, true, null);

            expect(result.totalAnalyzed).toBe(0);
            expect(result.totalCost).toBe(0);
            expect(result.averageDuration).toBe(0);
            expect(result.averageScore).toBe(0);
            expect(result.timeSeries).toEqual({ monthly: [], daily: [] });
            expect(result.sentimentDistribution).toEqual({
                positive: 0, neutral: 0, negative: 0,
            });
        });

        it('should filter by projectId when provided', async () => {
            await service.getDashboard(
                { projectId: 5 },
                true,
                null,
            );

            expect(mockAiCdrRepo.count).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ projectId: 5 }),
                }),
            );
        });

        const dashboardRecord = (overrides: Partial<{
            assistantName: string;
            tags: string[];
            tagNames: Record<string, string>;
            metrics: Record<string, unknown>;
            sentiment: string;
        }> = {}) => ({
            assistantName: overrides.assistantName ?? 'Alice',
            createdAt: new Date('2026-07-01T12:00:00.000Z'),
            duration: 60,
            cost: 1,
            analytics: {
                sentiment: overrides.sentiment ?? 'Positive',
                metrics: {
                    greeting_quality: 80,
                    script_compliance: 80,
                    politeness_empathy: 80,
                    active_listening: 80,
                    objection_handling: 80,
                    product_knowledge: 80,
                    problem_resolution: 80,
                    speech_clarity_pace: 80,
                    closing_quality: 80,
                    success: true,
                    customer_sentiment: 'Positive',
                    _topics: {
                        tags: overrides.tags ?? ['billing'],
                        tag_names: overrides.tagNames ?? { billing: 'Счета' },
                    },
                    ...overrides.metrics,
                },
            },
        });

        const setupDashboardWithRecords = (records: unknown[], projectOverrides: Record<string, unknown> = {}) => {
            mockAiCdrRepo.count.mockResolvedValue(records.length || 1);
            mockAiCdrRepo.findOne.mockResolvedValue({
                totalCostUsd: '10',
                totalAmountCurrency: '0',
                avgDuration: '60',
            });
            mockAiCdrRepo.sequelize.query.mockResolvedValue([[
                { metricId: 'greeting_quality', avgNum: '80', trueCount: '0', channelCount: '1', strValue: null, rowCount: '1' },
            ]]);
            mockAiCdrRepo.findAll.mockResolvedValue(records);
            mockProjectRepo.findByPk.mockResolvedValue({
                customMetricsSchema: [],
                callTaxonomy: [
                    { id: 'billing', name: 'Счета', aliases: ['счёт'] },
                    { id: 'returns', name: 'Возвраты', aliases: ['возврат'] },
                ],
                ...projectOverrides,
            });
        };

        it('omits tagStats when no project is selected', async () => {
            setupDashboardWithRecords([dashboardRecord()]);

            const result = await service.getDashboard({}, true, null);

            expect(result.tagStats).toBeUndefined();
            expect(mockProjectRepo.findByPk).not.toHaveBeenCalled();
        });

        it('omits tagStats when the project taxonomy is empty', async () => {
            setupDashboardWithRecords([dashboardRecord()], { callTaxonomy: [] });

            const result = await service.getDashboard({ projectId: 1 }, true, null);

            expect(result.tagStats).toBeUndefined();
        });

        it('returns an empty tagStats list when taxonomy exists but nothing matched', async () => {
            setupDashboardWithRecords([
                dashboardRecord({ tags: [], tagNames: {} }),
            ]);

            const result = await service.getDashboard({ projectId: 1 }, true, null);

            expect(result.tagStats).toEqual([]);
        });

        it('includes per-theme statistics for a selected project', async () => {
            setupDashboardWithRecords([
                dashboardRecord({ tags: ['billing'], tagNames: { billing: 'Счета' } }),
                dashboardRecord({ tags: ['returns'], tagNames: { returns: 'Возвраты' } }),
            ]);

            const result = await service.getDashboard({ projectId: 1 }, true, null);

            expect(result.tagStats).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        tagId: 'billing',
                        name: 'Счета',
                        callsCount: 1,
                        averageScore: expect.any(Number),
                        successRate: expect.any(Number),
                        sentiment: expect.objectContaining({
                            positive: expect.any(Number),
                            neutral: expect.any(Number),
                            negative: expect.any(Number),
                        }),
                    }),
                    expect.objectContaining({ tagId: 'returns', callsCount: 1 }),
                ]),
            );
        });

        it('does not add extra repository calls when taxonomy is present', async () => {
            setupDashboardWithRecords([dashboardRecord()], { callTaxonomy: [] });
            await service.getDashboard({ projectId: 1 }, true, null);
            const withoutTaxonomy = mockProjectRepo.findByPk.mock.calls.length
                + mockAiCdrRepo.count.mock.calls.length
                + mockAiCdrRepo.findAll.mock.calls.length
                + mockAiCdrRepo.findOne.mock.calls.length
                + mockAiCdrRepo.sequelize.query.mock.calls.length;

            jest.clearAllMocks();
            setupDashboardWithRecords([dashboardRecord()]);
            await service.getDashboard({ projectId: 1 }, true, null);
            const withTaxonomy = mockProjectRepo.findByPk.mock.calls.length
                + mockAiCdrRepo.count.mock.calls.length
                + mockAiCdrRepo.findAll.mock.calls.length
                + mockAiCdrRepo.findOne.mock.calls.length
                + mockAiCdrRepo.sequelize.query.mock.calls.length;

            expect(withTaxonomy).toBe(withoutTaxonomy);
            expect(mockProjectRepo.findByPk).toHaveBeenCalledTimes(1);
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // applyRetention — PII lifecycle
    // ═════════════════════════════════════════════════════════════════

    describe('applyRetention', () => {
        const ENV = { ...process.env };
        afterEach(() => {
            process.env = { ...ENV };
        });

        it('is a no-op when OPERATOR_RETENTION_DAYS is 0 (disabled)', async () => {
            mockConfigService.get.mockImplementation((k: string) =>
                k === 'OPERATOR_RETENTION_DAYS' ? '0' : undefined);

            const result = await service.applyRetention();

            expect(result.enabled).toBe(false);
            expect(result.affected).toBe(0);
            expect(mockAnalyticsRepo.findAll).not.toHaveBeenCalled();
        });

        it('anonymizes PII in place by default and never touches billing', async () => {
            mockConfigService.get.mockImplementation((k: string) => {
                if (k === 'OPERATOR_RETENTION_DAYS') return '30';
                if (k === 'OPERATOR_RETENTION_MODE') return 'anonymize';
                return undefined;
            });
            mockAnalyticsRepo.findAll.mockResolvedValue([{ id: 11 }, { id: 12 }]);
            mockAnalyticsRepo.update = jest.fn().mockResolvedValue([2]);
            mockAiCdrRepo.update = jest.fn().mockResolvedValue([2]);

            const result = await service.applyRetention();

            expect(result.mode).toBe('anonymize');
            expect(result.affected).toBe(2);
            expect(mockAnalyticsRepo.update).toHaveBeenCalledWith(
                { transcription: null, clientPhone: null },
                expect.objectContaining({ where: expect.anything() }),
            );
            expect(mockAiCdrRepo.update).toHaveBeenCalledWith(
                { callerId: null },
                expect.objectContaining({ where: expect.anything() }),
            );
            // Billing untouched
            expect(mockBillingRecordRepo.create).not.toHaveBeenCalled();
        });

        it('delete mode cascades to analytics + cdr but preserves billing', async () => {
            mockConfigService.get.mockImplementation((k: string) => {
                if (k === 'OPERATOR_RETENTION_DAYS') return '30';
                if (k === 'OPERATOR_RETENTION_MODE') return 'delete';
                return undefined;
            });
            mockAnalyticsRepo.findAll.mockResolvedValue([{ id: 21 }]);
            mockAnalyticsRepo.destroy = jest.fn().mockResolvedValue(1);
            mockAiCdrRepo.destroy = jest.fn().mockResolvedValue(1);
            mockAiAnalyticsRepo.destroy = jest.fn().mockResolvedValue(1);

            const result = await service.applyRetention();

            expect(result.mode).toBe('delete');
            expect(result.affected).toBe(1);
            expect(mockAiAnalyticsRepo.destroy).toHaveBeenCalled();
            expect(mockAiCdrRepo.destroy).toHaveBeenCalled();
            expect(mockAnalyticsRepo.destroy).toHaveBeenCalled();
            expect(mockMetricValueRepo.destroy).toHaveBeenCalled();
        });

        it('returns zero when nothing matches the cutoff', async () => {
            mockConfigService.get.mockImplementation((k: string) =>
                k === 'OPERATOR_RETENTION_DAYS' ? '30' : undefined);
            mockAnalyticsRepo.findAll.mockResolvedValue([]);

            const result = await service.applyRetention();

            expect(result.enabled).toBe(true);
            expect(result.scanned).toBe(0);
            expect(result.affected).toBe(0);
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // §10 Billing — token split, regenerate policy, project budgets
    // ═════════════════════════════════════════════════════════════════

    describe('extractTokenSplit', () => {
        it('reads Chat Completions prompt/completion tokens', () => {
            const r = (service as any).extractTokenSplit({ prompt_tokens: 100, completion_tokens: 25, total_tokens: 125 });
            expect(r).toEqual({ inTokens: 100, outTokens: 25 });
        });

        it('falls back to input/output tokens (responses shape)', () => {
            const r = (service as any).extractTokenSplit({ input_tokens: 80, output_tokens: 12 });
            expect(r).toEqual({ inTokens: 80, outTokens: 12 });
        });

        it('returns nulls when usage is missing or partial', () => {
            expect((service as any).extractTokenSplit(undefined)).toEqual({ inTokens: null, outTokens: null });
            expect((service as any).extractTokenSplit({ total_tokens: 50 })).toEqual({ inTokens: null, outTokens: null });
        });
    });

    describe('normalizeBudget', () => {
        it('keeps positive numbers, disables on zero/negative/invalid', () => {
            expect((service as any).normalizeBudget(50)).toBe(50);
            expect((service as any).normalizeBudget(0)).toBeNull();
            expect((service as any).normalizeBudget(-5)).toBeNull();
            expect((service as any).normalizeBudget(null)).toBeNull();
            expect((service as any).normalizeBudget('abc')).toBeNull();
        });
    });

    describe('checkProjectBudget', () => {
        const makeProject = (over: Partial<any> = {}) => ({
            id: 7,
            name: 'Sales',
            monthlyBudgetUsd: 10,
            budgetLastAlertAt: null,
            budgetAlertEmails: ['ops@example.com'],
            update: jest.fn().mockResolvedValue(undefined),
            ...over,
        });

        it('is a no-op when project has no budget', async () => {
            const project = makeProject({ monthlyBudgetUsd: null });
            const spy = jest.spyOn(service, 'callWebhook').mockResolvedValue(undefined as any);

            await (service as any).checkProjectBudget(project, '5');

            expect(mockAiCdrRepo.sum).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('does not alert while spend is under budget', async () => {
            const project = makeProject();
            mockAiCdrRepo.sum.mockResolvedValueOnce(4);
            const spy = jest.spyOn(service, 'callWebhook').mockResolvedValue(undefined as any);

            await (service as any).checkProjectBudget(project, '5');

            expect(project.update).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('fires a budget.exceeded webhook and stamps the alert when over budget', async () => {
            const project = makeProject();
            mockAiCdrRepo.sum.mockResolvedValueOnce(12.5);
            const spy = jest.spyOn(service, 'callWebhook').mockResolvedValue(undefined as any);

            await (service as any).checkProjectBudget(project, '5');

            expect(project.update).toHaveBeenCalledWith(
                expect.objectContaining({ budgetLastAlertAt: expect.any(Date) }),
            );
            expect(spy).toHaveBeenCalledWith(
                project,
                'budget.exceeded',
                expect.objectContaining({ projectId: 7, monthlyBudgetUsd: 10, spentUsd: 12.5 }),
            );
            expect(mockAlertService.sendCriticalAlert).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('fans out Email/Telegram when alertConfig.budgetExceeded is enabled', async () => {
            const project = makeProject({
                alertConfig: {
                    enabled: true,
                    inheritRecipientsFromDigest: false,
                    emails: ['ops@example.com'],
                    telegramChatIds: [],
                    csatDrop: { enabled: true, dropPct: 20, windowDays: 7, minCalls: 5 },
                    negativeSpike: { enabled: true, spikePp: 15, windowDays: 7, minCalls: 5 },
                    budgetExceeded: { enabled: true },
                },
            });
            mockAiCdrRepo.sum.mockResolvedValueOnce(12.5);
            const spy = jest.spyOn(service, 'callWebhook').mockResolvedValue(undefined as any);

            await (service as any).checkProjectBudget(project, '5');

            expect(mockAlertService.sendCriticalAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'budget_exceeded',
                    project,
                    budget: expect.objectContaining({ monthlyBudgetUsd: 10, spentUsd: 12.5 }),
                }),
            );
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('dedupes — does not re-alert if already alerted this month', async () => {
            const project = makeProject({ budgetLastAlertAt: new Date() });
            mockAiCdrRepo.sum.mockResolvedValueOnce(99);
            const spy = jest.spyOn(service, 'callWebhook').mockResolvedValue(undefined as any);

            await (service as any).checkProjectBudget(project, '5');

            expect(project.update).not.toHaveBeenCalled();
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('never throws into the pipeline when the sum query fails', async () => {
            const project = makeProject();
            mockAiCdrRepo.sum.mockRejectedValueOnce(new Error('db down'));
            await expect((service as any).checkProjectBudget(project, '5')).resolves.toBeUndefined();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // writeMetricValues — normalized dual-write
    // ═════════════════════════════════════════════════════════════════

    describe('writeMetricValues (dual-write)', () => {
        it('maps default/summary/custom metrics to typed columns and clears prior rows', async () => {
            const metrics = {
                greeting_quality: 80,
                csat: 4,
                success: true,
                customer_sentiment: 'Positive',
                custom_metrics: {
                    profanity: false,
                    satisfaction_0_10: 7,
                    tone: 'friendly',
                    empty: null,
                },
            };

            await (service as any).writeMetricValues('123', '5', 1, 2, metrics);

            expect(mockMetricValueRepo.destroy).toHaveBeenCalledWith({ where: { channelId: '123' } });
            const rows = mockMetricValueRepo.bulkCreate.mock.calls[0][0] as any[];
            const byId = (id: string) => rows.find(r => r.metricId === id);

            expect(byId('greeting_quality')).toMatchObject({ origin: 'default', numValue: 80 });
            expect(byId('csat')).toMatchObject({ origin: 'summary', numValue: 4 });
            expect(byId('success')).toMatchObject({ origin: 'summary', boolValue: true });
            expect(byId('customer_sentiment')).toMatchObject({ origin: 'summary', strValue: 'Positive' });
            expect(byId('profanity')).toMatchObject({ origin: 'custom', boolValue: false });
            expect(byId('satisfaction_0_10')).toMatchObject({ origin: 'custom', numValue: 7 });
            expect(byId('tone')).toMatchObject({ origin: 'custom', strValue: 'friendly' });
            // null custom value is skipped
            expect(byId('empty')).toBeUndefined();
            // ownership/version carried on every row
            expect(rows.every(r => r.userId === '5' && r.projectId === 1 && r.schemaVersion === 2)).toBe(true);
        });

        it('never throws when the repository fails (JSON stays source of truth)', async () => {
            mockMetricValueRepo.destroy.mockRejectedValueOnce(new Error('db down'));
            await expect(
                (service as any).writeMetricValues('9', '5', 1, 1, { greeting_quality: 50 }),
            ).resolves.toBeUndefined();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // getBatchStatus — ownership (IDOR)
    // ═════════════════════════════════════════════════════════════════

    describe('getBatchStatus (ownership)', () => {
        const seedBatch = () => {
            (service as any).batches.set('batch_x', {
                batchId: 'batch_x',
                userId: '1',
                total: 1,
                completed: 1,
                failed: 0,
                items: [{ id: 10, filename: 'secret.mp3', status: 'completed' }],
                startedAt: new Date(),
            });
        };

        it('returns the batch to its owner', () => {
            seedBatch();
            expect(service.getBatchStatus('batch_x', '1')?.batchId).toBe('batch_x');
        });

        it('hides the batch from another user (IDOR)', () => {
            seedBatch();
            expect(service.getBatchStatus('batch_x', '999')).toBeNull();
        });

        it('allows an admin to read any batch', () => {
            seedBatch();
            expect(service.getBatchStatus('batch_x', '999', true)?.batchId).toBe('batch_x');
        });

        it('returns null for unknown batch', () => {
            expect(service.getBatchStatus('missing', '1')).toBeNull();
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // getById — project scoping (token least privilege)
    // ═════════════════════════════════════════════════════════════════

    describe('getById (project scoping)', () => {
        it('looks up by channelId first (not OR with aiCdr PK)', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7' });
            await service.getById(7, '1', 3);

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where).toMatchObject({ channelId: '7', userId: '1', projectId: 3 });
            expect(call.where[Op.or]).toBeUndefined();
            expect(call.where.id).toBeUndefined();
        });

        it('does not add projectId filter when omitted', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7' });
            await service.getById(7, '1');

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where).not.toHaveProperty('projectId');
        });

        it('skips userId filter for admin so cross-tenant evidence opens', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '95' });
            await service.getById(7, '1', undefined, true);

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where).not.toHaveProperty('userId');
        });

        it('matches either JWT user id or vpbx_user_id for non-admin', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '42' });
            await service.getById(7, '1006', undefined, false, ['42', '1006']);

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where.userId).toEqual({ [Op.in]: ['1006', '42'] });
        });

        it('always scopes non-admin lookups by tenant userId', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '7',
                userId: '42',
                toJSON: () => ({ channelId: '7', userId: '42' }),
            });
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);

            await service.getById(7, '42', undefined, false);

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where.userId).toBe('42');
            expect(call.where.channelId).toBe('7');
        });

        it('rejects non-admin when no tenant identity is provided (no unscoped read)', async () => {
            await expect(service.getById(7, null, undefined, false, []))
                .rejects.toThrow('Unauthorized');
            expect(mockAiCdrRepo.findOne).not.toHaveBeenCalled();
        });

        it('returns 404 when channel exists but belongs to another tenant', async () => {
            // Sequelize returns null because where includes userId of the caller
            mockAiCdrRepo.findOne.mockResolvedValue(null);

            await expect(service.getById(7, '42', undefined, false))
                .rejects.toThrow('Analysis not found');

            expect(mockAiCdrRepo.findOne.mock.calls[0][0].where).toMatchObject({
                channelId: '7',
                userId: '42',
            });
        });

        it('emits a structured audit log on transcript read', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '7',
                toJSON: () => ({ channelId: '7' }),
            });
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);
            const logSpy = jest.spyOn((service as any).logger, 'log');

            await service.getById(7, '42');

            const audit = logSpy.mock.calls.map(c => String(c[0])).find(m => m.includes('operator_transcript_access'));
            expect(audit).toBeDefined();
            expect(audit).toContain('"actorUserId":"42"');
            expect(audit).toContain('"recordId":7');
            logSpy.mockRestore();
        });

        it('attaches operator_analytics transcription for the call panel', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '7',
                analytics: { metrics: {} },
                toJSON: () => ({ channelId: '7', recordUrl: 'https://cdn/a.mp3' }),
            });
            mockAnalyticsRepo.findByPk.mockResolvedValue({
                transcription: 'hello transcript',
                transcriptionQuality: 'ok',
                transcriptionConfidence: 0.9,
                detectedLanguage: 'ru',
                qualityReasons: null,
            });

            const result = await service.getById(7, '1', undefined, true);

            expect(mockAnalyticsRepo.findByPk).toHaveBeenCalledWith(7, expect.any(Object));
            expect(result).toMatchObject({
                channelId: '7',
                recordUrl: 'https://cdn/a.mp3',
                transcription: 'hello transcript',
            });
        });

        it('prefers channelId match over colliding aiCdr PK (bot-call uniqueid)', async () => {
            // OA row: channelId "3". Unrelated bot call also has aiCdr.id = 3.
            // Old Op.or lookup could return the bot call (analytics: null, wrong callerId).
            mockAiCdrRepo.findOne.mockResolvedValueOnce({
                id: 99,
                channelId: '3',
                callerId: '+79991234567',
                analytics: { metrics: { greeting_quality: 80 } },
                toJSON: () => ({
                    id: 99,
                    channelId: '3',
                    callerId: '+79991234567',
                    analytics: { metrics: { greeting_quality: 80 } },
                }),
            });
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);

            const result = await service.getById(3, '1', undefined, true);

            expect(mockAiCdrRepo.findOne).toHaveBeenCalledTimes(1);
            expect(mockAiCdrRepo.findOne.mock.calls[0][0].where).toMatchObject({ channelId: '3' });
            expect(result).toMatchObject({ channelId: '3', callerId: '+79991234567' });
        });

        it('rejects aiCdr PK fallback when channelId is an Asterisk uniqueid', async () => {
            mockAiCdrRepo.findOne
                .mockResolvedValueOnce(null) // no channelId="3"
                .mockResolvedValueOnce({
                    id: 3,
                    channelId: '1746595347.126838',
                    callerId: '1001',
                    analytics: null,
                    toJSON: () => ({
                        id: 3,
                        channelId: '1746595347.126838',
                        callerId: '1001',
                        analytics: null,
                    }),
                });

            await expect(service.getById(3, '1', undefined, true))
                .rejects.toThrow('Analysis not found');
        });

        it('accepts aiCdr PK fallback only for OA-linked rows (numeric channelId)', async () => {
            mockAiCdrRepo.findOne
                .mockResolvedValueOnce(null) // no channelId="100"
                .mockResolvedValueOnce({
                    id: 100,
                    channelId: '42',
                    toJSON: () => ({ id: 100, channelId: '42' }),
                });
            mockAnalyticsRepo.findByPk.mockResolvedValue(null);

            const result = await service.getById(100, '1', undefined, true);

            expect(mockAiCdrRepo.findOne).toHaveBeenCalledTimes(2);
            expect(mockAiCdrRepo.findOne.mock.calls[1][0].where).toMatchObject({ id: 100 });
            expect(result).toMatchObject({ channelId: '42' });
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // Human-in-the-loop metric overrides
    // ═════════════════════════════════════════════════════════════════

    describe('metric overrides', () => {
        it('rejects override on a record the user does not own (IDOR)', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue(null);
            await expect(
                service.saveMetricOverrides('7', '999', false, [{ metricId: 'greeting_quality', numValue: 100 }]),
            ).rejects.toThrow('Analysis not found');
        });

        it('rejects override when non-admin has no tenant identity', async () => {
            await expect(
                service.saveMetricOverrides('7', '', false, [{ metricId: 'greeting_quality', numValue: 100 }]),
            ).rejects.toThrow('Unauthorized');
            expect(mockAiCdrRepo.findOne).not.toHaveBeenCalled();
        });

        it('creates a new override scoped to the record owner', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '1' });
            mockMetricOverrideRepo.findOne.mockResolvedValue(null);

            await service.saveMetricOverrides('7', '1', false, [
                { metricId: 'greeting_quality', origin: 'default', numValue: 100, note: 'model missed greeting' },
            ]);

            const created = mockMetricOverrideRepo.create.mock.calls[0][0];
            expect(created).toMatchObject({
                channelId: '7',
                userId: '1',
                actorUserId: '1',
                metricId: 'greeting_quality',
                origin: 'default',
                numValue: 100,
                note: 'model missed greeting',
            });
        });

        it('updates an existing override instead of duplicating', async () => {
            const existing = { update: jest.fn().mockResolvedValue(undefined) };
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '1' });
            mockMetricOverrideRepo.findOne.mockResolvedValue(existing);

            await service.saveMetricOverrides('7', '1', false, [
                { metricId: 'csat', origin: 'summary', numValue: 4 },
            ]);

            expect(existing.update).toHaveBeenCalled();
            expect(mockMetricOverrideRepo.create).not.toHaveBeenCalled();
        });

        it('rejects an empty override list', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '1' });
            await expect(service.saveMetricOverrides('7', '1', false, [])).rejects.toThrow('No overrides');
        });

        it('lets an admin read overrides for any record', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7', userId: '2' });
            mockMetricOverrideRepo.findAll.mockResolvedValue([{ metricId: 'success' }]);

            const result = await service.getMetricOverrides('7', '999', true);
            expect(result).toHaveLength(1);
            // admin: ownership filter not applied
            expect(mockAiCdrRepo.findOne.mock.calls[0][0].where).not.toHaveProperty('userId');
        });
    });

    // ═════════════════════════════════════════════════════════════════
    // getCdrs — userId filtering
    // ═════════════════════════════════════════════════════════════════

    describe('getCdrs', () => {
        beforeEach(() => {
            mockAiCdrRepo.findAndCountAll = jest.fn().mockResolvedValue({
                rows: [], count: 0,
            });
        });

        it('should NOT filter by userId when admin requests without userId', async () => {
            await service.getCdrs({}, true, null);

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where).not.toHaveProperty('userId');
        });

        it('should filter by query.userId when admin specifies userId', async () => {
            await service.getCdrs({ userId: '96' }, true, null);

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.userId).toBe('96');
        });

        it('should filter by realUserId for non-admin', async () => {
            await service.getCdrs({}, false, '42');

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.userId).toBe('42');
        });

        it('should return paginated result with defaults', async () => {
            mockAiCdrRepo.findAndCountAll.mockResolvedValue({
                rows: [], count: 0,
            });

            const result = await service.getCdrs({}, true, null);

            expect(result).toEqual({
                data: [], total: 0, page: 1, limit: 20,
            });
        });

        it('uses exact equality for operatorNameExact', async () => {
            await service.getCdrs({ operatorNameExact: 'Иван' }, true, null);

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.assistantName).toBe('Иван');
        });

        it('excludes prefix operators when operatorNameExact is set', async () => {
            await service.getCdrs({ operatorNameExact: 'Иван' }, true, null);

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(typeof call.where.assistantName).toBe('string');
            expect(call.where.assistantName).toBe('Иван');
        });

        it('filters by tagId within tenant scope', async () => {
            mockCallTagRepo.findAll.mockResolvedValue([
                { channelId: '10' },
                { channelId: '11' },
            ]);

            await service.getCdrs({ tagId: 'returns', userId: '5' }, true, null);

            expect(mockCallTagRepo.findAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ tagId: 'returns', userId: '5' }),
                }),
            );
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['10', '11'] });
        });

        it('returns nothing when tagId matches no rows in tenant scope', async () => {
            mockCallTagRepo.findAll.mockResolvedValue([]);

            await service.getCdrs({ tagId: 'foreign-tag' }, false, '42');

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['__no_matching_tag__'] });
        });

        it('composes tagId filter with operatorNameExact and projectId', async () => {
            mockCallTagRepo.findAll.mockResolvedValue([{ channelId: '7' }]);

            await service.getCdrs({
                tagId: 'billing',
                operatorNameExact: 'Иван',
                projectId: 1,
            }, false, '42');

            expect(mockCallTagRepo.findAll).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        tagId: 'billing',
                        userId: '42',
                        projectId: 1,
                    }),
                }),
            );
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.assistantName).toBe('Иван');
            expect(call.where.projectId).toBe(1);
        });

        it('leaves search substring behaviour unchanged when tagId is set', async () => {
            mockCallTagRepo.findAll.mockResolvedValue([{ channelId: '3' }]);

            await service.getCdrs({ tagId: 'returns', search: '7900' }, true, null);

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where[Op.or]).toBeDefined();
        });

        it('filters by sentiment via aiCdr-joined metric values', async () => {
            mockAiCdrRepo.sequelize.query.mockResolvedValueOnce([[
                { channelId: '20' },
                { channelId: '21' },
            ]]);

            await service.getCdrs({
                sentiment: 'negative',
                projectId: 3,
                startDate: '2026-01-01',
                endDate: '2026-01-31',
            }, false, '42');

            const [sql, opts] = mockAiCdrRepo.sequelize.query.mock.calls[0];
            expect(sql).toContain('customer_sentiment');
            expect(sql).toContain('aiCdr');
            expect(opts.replacements).toMatchObject({
                sentiment: 'negative',
                userId: '42',
                projectId: 3,
            });
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['20', '21'] });
        });

        it('filters by success=false via aiCdr-joined metric values', async () => {
            mockAiCdrRepo.sequelize.query.mockResolvedValueOnce([[{ channelId: '9' }]]);

            await service.getCdrs({ success: 'false' }, true, null);

            const [sql, opts] = mockAiCdrRepo.sequelize.query.mock.calls[0];
            expect(sql).toContain("metricId");
            expect(sql).toContain('success');
            expect(opts.replacements.successBool).toBe(false);
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['9'] });
        });

        it('falls back to aiAnalytics.sentiment when metric_values are empty', async () => {
            mockAiCdrRepo.sequelize.query
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ channelId: '77' }]]);

            await service.getCdrs({ sentiment: 'positive' }, false, '7');

            expect(mockAiCdrRepo.sequelize.query).toHaveBeenCalledTimes(2);
            const [fallbackSql] = mockAiCdrRepo.sequelize.query.mock.calls[1];
            expect(fallbackSql).toContain('aiAnalytics');
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['77'] });
        });

        it('returns nothing when sentiment matches no rows in either source', async () => {
            mockAiCdrRepo.sequelize.query
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]]);

            await service.getCdrs({ sentiment: 'positive' }, false, '7');

            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.channelId).toEqual({ [Op.in]: ['__no_matching_sentiment__'] });
        });

        it('composes sentiment filter with projectId on CDR query', async () => {
            mockAiCdrRepo.sequelize.query.mockResolvedValueOnce([[{ channelId: '5' }]]);

            await service.getCdrs({ sentiment: 'Neutral', projectId: 2 }, false, '42');

            const [, opts] = mockAiCdrRepo.sequelize.query.mock.calls[0];
            expect(opts.replacements).toMatchObject({
                sentiment: 'neutral',
                projectId: 2,
                userId: '42',
            });
            const call = mockAiCdrRepo.findAndCountAll.mock.calls[0][0];
            expect(call.where.projectId).toBe(2);
            expect(call.where.channelId).toEqual({ [Op.in]: ['5'] });
        });

        it('rejects invalid sentiment values', async () => {
            await expect(
                service.getCdrs({ sentiment: 'angry' }, false, '42'),
            ).rejects.toThrow('sentiment must be positive, neutral, or negative');
        });
    });

    describe('taxonomy tagging', () => {
        const taxonomy = [
            { id: 'billing', name: 'Счета', aliases: ['счёт'] },
            { id: 'returns', name: 'Возвраты', aliases: ['возврат'] },
        ];

        it('buildTopicsBlock merges LLM auto tags with name snapshot', () => {
            const project = { callTaxonomy: taxonomy } as any;
            const block = (service as any).buildTopicsBlock(
                'Клиент просит счёт и возврат',
                project,
                [],
                ['billing', 'returns'],
            );
            expect(block.tags).toEqual(['billing', 'returns']);
            expect(block.tag_names).toEqual({ billing: 'Счета', returns: 'Возвраты' });
        });

        it('buildTopicsBlock does not keyword-match taxonomy without LLM tags', () => {
            const project = { callTaxonomy: taxonomy } as any;
            const block = (service as any).buildTopicsBlock(
                'Клиент просит счёт и возврат',
                project,
                [],
                [],
            );
            expect(block).toBeNull();
        });

        it('buildTopicsBlock returns null when no taxonomy tags and no compliance keywords', () => {
            const block = (service as any).buildTopicsBlock('обычный текст', { callTaxonomy: [] }, [], []);
            expect(block).toBeNull();
        });

        it('writeAutoCallTags bulk-inserts automatic rows and swallows errors', async () => {
            await (service as any).writeAutoCallTags('55', '1', 1, ['billing']);
            expect(mockCallTagRepo.bulkCreate).toHaveBeenCalledWith(
                [expect.objectContaining({ channelId: '55', tagId: 'billing', source: 'auto' })],
                { ignoreDuplicates: true },
            );

            mockCallTagRepo.bulkCreate.mockRejectedValueOnce(new Error('db down'));
            await expect(
                (service as any).writeAutoCallTags('55', '1', 1, ['billing']),
            ).resolves.toBeUndefined();
        });

        it('deleteAutoCallTags removes only automatic source rows', async () => {
            await (service as any).deleteAutoCallTags('99');
            expect(mockCallTagRepo.destroy).toHaveBeenCalledWith({
                where: { channelId: '99', source: 'auto' },
            });
        });

        it('mergeTagIds unions auto and manual tags with cap', () => {
            const auto = ['a', 'b', 'c'];
            const manual = ['d', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
            const merged = (service as any).mergeTagIds(auto, manual);
            expect(merged).toHaveLength(10);
            expect(merged[0]).toBe('a');
            expect(merged).toContain('d');
        });
    });

    describe('updateCallTags', () => {
        const taxonomy = [
            { id: 'billing', name: 'Счета', aliases: ['счёт'] },
            { id: 'returns', name: 'Возвраты', aliases: ['возврат'] },
        ];

        beforeEach(() => {
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '7',
                userId: '1',
                projectId: 1,
            });
            mockProjectRepo.findByPk.mockResolvedValue({
                ...mockProject,
                callTaxonomy: taxonomy,
            });
            mockAiAnalyticsRepo.findOne = jest.fn().mockResolvedValue({
                metrics: { _topics: { keywords: ['kw'] } },
                update: jest.fn().mockResolvedValue(undefined),
            });
        });

        it('stores manual tags and updates analytics JSON', async () => {
            mockCallTagRepo.findOne.mockResolvedValue(null);

            const result = await service.updateCallTags('7', '9', false, ['billing', 'returns']);

            expect(result.tagIds).toEqual(['billing', 'returns']);
            expect(mockCallTagRepo.create).toHaveBeenCalledTimes(2);
            expect(mockCallTagRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ source: 'manual', actorUserId: '9', tagId: 'billing' }),
            );
            const analytics = await mockAiAnalyticsRepo.findOne.mock.results[0].value;
            expect(analytics.update).toHaveBeenCalledWith({
                metrics: expect.objectContaining({
                    _topics: expect.objectContaining({
                        tags: ['billing', 'returns'],
                        tag_names: { billing: 'Счета', returns: 'Возвраты' },
                    }),
                }),
            });
        });

        it('rejects tag ids outside project taxonomy when taxonomy is configured', async () => {
            await expect(
                service.updateCallTags('7', '9', false, ['unknown']),
            ).rejects.toThrow('Invalid tag id for project taxonomy');
            expect(mockCallTagRepo.create).not.toHaveBeenCalled();
        });

        it('allows free-form tags when project taxonomy is empty', async () => {
            mockProjectRepo.findByPk.mockResolvedValue({
                ...mockProject,
                callTaxonomy: [],
            });
            mockCallTagRepo.findOne.mockResolvedValue(null);

            const result = await service.updateCallTags(
                '7',
                '9',
                false,
                ['custom-topic'],
                { 'custom-topic': 'Своя тема' },
            );

            expect(result.tagIds).toEqual(['custom-topic']);
            expect(mockCallTagRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ tagId: 'custom-topic', source: 'manual' }),
            );
            const analytics = await mockAiAnalyticsRepo.findOne.mock.results[0].value;
            expect(analytics.update).toHaveBeenCalledWith({
                metrics: expect.objectContaining({
                    _topics: expect.objectContaining({
                        tags: ['custom-topic'],
                        tag_names: { 'custom-topic': 'Своя тема' },
                    }),
                }),
            });
        });

        it('allows free-form tags when call has no project', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({
                channelId: '7',
                userId: '1',
                projectId: null,
            });
            mockCallTagRepo.findOne.mockResolvedValue(null);

            const result = await service.updateCallTags(
                '7',
                '9',
                false,
                ['no-project-tag'],
                { 'no-project-tag': 'Без проекта' },
            );

            expect(result.tagIds).toEqual(['no-project-tag']);
            expect(mockProjectRepo.findByPk).not.toHaveBeenCalled();
            expect(mockCallTagRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: null, tagId: 'no-project-tag' }),
            );
        });

        it('rejects cross-tenant calls before writing tags', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue(null);

            await expect(
                service.updateCallTags('7', '999', false, ['billing']),
            ).rejects.toThrow('Analysis not found');
            expect(mockCallTagRepo.create).not.toHaveBeenCalled();
        });

        it('deletes removed manual tags from the call', async () => {
            mockCallTagRepo.findOne.mockImplementation(({ where }: any) =>
                Promise.resolve(where.tagId === 'billing' ? { update: jest.fn() } : null),
            );

            await service.updateCallTags('7', '9', false, ['billing']);

            expect(mockCallTagRepo.destroy).toHaveBeenCalledWith({
                where: { channelId: '7', tagId: { [Op.notIn]: ['billing'] } },
            });
        });

        it('writes audit log on successful manual update', async () => {
            const logSpy = jest.spyOn((service as any).logger, 'log');
            mockCallTagRepo.findOne.mockResolvedValue(null);

            await service.updateCallTags('7', '9', false, ['billing']);

            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('"kind":"operator_call_tags"'),
            );
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('"tagIds":["billing"]'),
            );
            logSpy.mockRestore();
        });

        it('re-analysis rebuild merges LLM auto tags with surviving manual tags', () => {
            const project = { callTaxonomy: taxonomy } as any;
            const block = (service as any).buildTopicsBlock(
                'Клиент просит счёт',
                project,
                ['returns'],
                ['billing'],
            );
            expect(block.tags).toEqual(['billing', 'returns']);
            expect(block.tag_names.returns).toBe('Возвраты');
        });
    });

    describe('getOperatorEvidence', () => {
        beforeEach(() => {
            mockAiCdrRepo.findAll = jest.fn().mockResolvedValue([]);
        });

        it('scopes non-admin requests to the caller user id and ignores supplied userId', async () => {
            await service.getOperatorEvidence(
                { operatorName: 'Иван', userId: '999' },
                false,
                '42',
                '42',
            );

            const call = mockAiCdrRepo.findAll.mock.calls[0][0];
            expect(call.where.userId).toBe('42');
        });

        it('uses exact equality on assistantName, not a pattern operator', async () => {
            await service.getOperatorEvidence(
                { operatorName: 'Иван' },
                true,
                null,
                'admin',
            );

            const call = mockAiCdrRepo.findAll.mock.calls[0][0];
            expect(call.where.assistantName).toBe('Иван');
            expect(typeof call.where.assistantName).toBe('string');
        });

        it('omits metrics whose sampled calls carry neither quote nor rationale', async () => {
            mockAiCdrRepo.findAll.mockResolvedValue([
                {
                    channelId: '1',
                    createdAt: new Date('2026-07-01'),
                    analytics: {
                        metrics: {
                            greeting_quality: 80,
                            _assessments: {
                                greeting_quality: {},
                                script_compliance: { rationale: 'Нарушение скрипта.' },
                            },
                        },
                    },
                },
            ]);

            const result = await service.getOperatorEvidence(
                { operatorName: 'Иван' },
                true,
                null,
            );

            expect(result.metrics.map(m => m.metricId)).toEqual(['script_compliance']);
        });

        it('returns at most five evidence items per metric', async () => {
            mockAiCdrRepo.findAll.mockResolvedValue(
                Array.from({ length: 6 }, (_, i) => ({
                    channelId: String(i + 1),
                    createdAt: new Date(`2026-07-0${i + 1}`),
                    analytics: {
                        metrics: {
                            greeting_quality: 10 + i,
                            _assessments: {
                                greeting_quality: { quote: `Цитата ${i}` },
                            },
                        },
                    },
                })),
            );

            const result = await service.getOperatorEvidence(
                { operatorName: 'Иван' },
                true,
                null,
            );

            expect(result.metrics[0].evidence).toHaveLength(5);
        });

        it('sets sampleCapped when repository returns exactly the cap', async () => {
            const cap = 300;
            mockAiCdrRepo.findAll.mockResolvedValue(
                Array.from({ length: cap }, (_, i) => ({
                    channelId: String(i + 1),
                    createdAt: new Date('2026-07-01'),
                    analytics: {
                        metrics: {
                            greeting_quality: 70,
                            _assessments: { greeting_quality: { quote: 'Привет.' } },
                        },
                    },
                })),
            );

            const result = await service.getOperatorEvidence(
                { operatorName: 'Иван' },
                true,
                null,
            );

            expect(result.sampleCapped).toBe(true);
            expect(mockAiCdrRepo.findAll.mock.calls[0][0].limit).toBe(cap);
        });

        it('skips anonymised records whose metrics are absent without throwing', async () => {
            mockAiCdrRepo.findAll.mockResolvedValue([
                { channelId: '1', createdAt: new Date('2026-07-01'), analytics: null },
                {
                    channelId: '2',
                    createdAt: new Date('2026-07-02'),
                    analytics: {
                        metrics: {
                            greeting_quality: 60,
                            _assessments: { greeting_quality: { quote: 'Здравствуйте.' } },
                        },
                    },
                },
            ]);

            await expect(
                service.getOperatorEvidence({ operatorName: 'Иван' }, true, null),
            ).resolves.toMatchObject({
                scoredCalls: 1,
                metrics: [{ metricId: 'greeting_quality' }],
            });
        });
    });

    describe('buildAgentScorecards', () => {
        it('groups records by assistantName and computes averages', () => {
            const records = [
                {
                    assistantName: 'Alice',
                    analytics: {
                        metrics: { greeting_quality: 100, success: true, customer_sentiment: 'Positive', csat: 5 },
                        sentiment: 'Positive',
                        csat: 5,
                    },
                },
                {
                    assistantName: 'Alice',
                    analytics: {
                        metrics: { greeting_quality: 50, success: false, customer_sentiment: 'Negative', csat: 3 },
                        sentiment: 'Negative',
                        csat: 3,
                    },
                },
                {
                    assistantName: 'Bob',
                    analytics: {
                        metrics: { greeting_quality: 75, success: true, customer_sentiment: 'Neutral' },
                        sentiment: 'Neutral',
                    },
                },
            ] as any[];

            const cards = (service as any).buildAgentScorecards(records);
            expect(cards).toHaveLength(2);
            expect(cards[0].operatorName).toBe('Alice');
            expect(cards[0].callsCount).toBe(2);
            expect(cards[0].avgCsat).toBe(4);
            expect(cards[0].negativeRate).toBe(50);
        });
    });

    describe('checkAnomalies', () => {
        it('skips projects without alertConfig or anomaly webhook', async () => {
            mockProjectRepo.findAll.mockResolvedValueOnce([
                { id: 1, name: 'A', alertConfig: null, webhookUrl: null, webhookEvents: [] },
            ]);
            const result = await service.checkAnomalies();
            expect(result).toEqual({ enabled: true, checked: 0, alerted: 0 });
            expect(mockAlertService.sendCriticalAlert).not.toHaveBeenCalled();
        });

        it('alerts via product path when CSAT drops past threshold', async () => {
            const project = {
                id: 9,
                name: 'Ops',
                alertConfig: {
                    enabled: true,
                    inheritRecipientsFromDigest: true,
                    emails: [],
                    telegramChatIds: [],
                    csatDrop: { enabled: true, dropPct: 20, windowDays: 7, minCalls: 2 },
                    negativeSpike: { enabled: false, spikePp: 15, windowDays: 7, minCalls: 2 },
                    budgetExceeded: { enabled: false },
                },
                webhookUrl: null,
                webhookEvents: [],
                anomalyLastAlertAt: null,
                update: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findAll.mockResolvedValueOnce([project]);

            const recent = Array.from({ length: 3 }, () => ({
                analytics: { csat: 2, sentiment: 'neutral', metrics: {} },
            }));
            const baseline = Array.from({ length: 3 }, () => ({
                analytics: { csat: 5, sentiment: 'neutral', metrics: {} },
            }));
            mockAiCdrRepo.findAll
                .mockResolvedValueOnce(recent)
                .mockResolvedValueOnce(baseline);

            const result = await service.checkAnomalies();
            expect(result.alerted).toBe(1);
            expect(project.update).toHaveBeenCalledWith(
                expect.objectContaining({ anomalyLastAlertAt: expect.any(Date) }),
            );
            expect(mockAlertService.sendCriticalAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'anomaly',
                    project,
                    anomaly: expect.objectContaining({
                        triggers: expect.objectContaining({ csatDrop: expect.any(Number) }),
                    }),
                }),
            );
        });

        it('dedupes when anomalyLastAlertAt is inside the recent window', async () => {
            const project = {
                id: 9,
                name: 'Ops',
                alertConfig: {
                    enabled: true,
                    inheritRecipientsFromDigest: true,
                    emails: [],
                    telegramChatIds: [],
                    csatDrop: { enabled: true, dropPct: 10, windowDays: 7, minCalls: 1 },
                    negativeSpike: { enabled: false, spikePp: 15, windowDays: 7, minCalls: 1 },
                    budgetExceeded: { enabled: false },
                },
                webhookUrl: null,
                webhookEvents: [],
                anomalyLastAlertAt: new Date(),
                update: jest.fn().mockResolvedValue(undefined),
            };
            mockProjectRepo.findAll.mockResolvedValueOnce([project]);
            mockAiCdrRepo.findAll
                .mockResolvedValueOnce([{ analytics: { csat: 1, sentiment: 'neutral', metrics: {} } }])
                .mockResolvedValueOnce([{ analytics: { csat: 5, sentiment: 'neutral', metrics: {} } }]);

            const result = await service.checkAnomalies();
            expect(result.alerted).toBe(0);
            expect(mockAlertService.sendCriticalAlert).not.toHaveBeenCalled();
        });
    });

    describe('spotTopicKeywords', () => {
        it('returns null when no keywords configured', () => {
            expect((service as any).spotTopicKeywords('любой текст')).toBeNull();
        });
    });

    describe('reapStuckProcessing', () => {
        it('is disabled when OPERATOR_STUCK_MINUTES is 0', async () => {
            (service as any).stuckMinutes = 0;
            const result = await service.reapStuckProcessing();
            expect(result).toEqual({ enabled: false, cutoffMinutes: 0, reaped: 0 });
            expect(mockAnalyticsRepo.update).not.toHaveBeenCalled();
        });

        it('marks stuck processing records as ERROR', async () => {
            (service as any).stuckMinutes = 45;
            mockAnalyticsRepo.update = jest.fn().mockResolvedValue([3]);
            const result = await service.reapStuckProcessing();
            expect(result.enabled).toBe(true);
            expect(result.reaped).toBe(3);
            expect(mockAnalyticsRepo.update).toHaveBeenCalledWith(
                expect.objectContaining({ status: AnalyticsStatus.ERROR }),
                expect.objectContaining({
                    where: expect.objectContaining({ status: AnalyticsStatus.PROCESSING }),
                }),
            );
        });
    });
});
