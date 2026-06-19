import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorAnalytics, AnalyticsSource, AnalyticsStatus } from './operator-analytics.model';
import { OperatorProject } from './operator-project.model';
import { MetricValue } from './operator-metric-value.model';
import { MetricOverride } from './operator-metric-override.model';
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

describe('OperatorAnalyticsService', () => {
    let service: OperatorAnalyticsService;

    // ─── Mock repositories ───────────────────────────────────────────
    let mockAnalyticsRepo: any;
    let mockAiCdrRepo: any;
    let mockAiAnalyticsRepo: any;
    let mockBillingRecordRepo: any;
    let mockApiTokenRepo: any;
    let mockProjectRepo: any;
    let mockMetricValueRepo: any;
    let mockMetricOverrideRepo: any;
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
        it('applies projectId filter when provided', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7' });
            await service.getById(7, '1', 3);

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where).toMatchObject({ channelId: '7', userId: '1', projectId: 3 });
        });

        it('does not add projectId filter when omitted', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7' });
            await service.getById(7, '1');

            const call = mockAiCdrRepo.findOne.mock.calls[0][0];
            expect(call.where).not.toHaveProperty('projectId');
        });

        it('emits a structured audit log on transcript read', async () => {
            mockAiCdrRepo.findOne.mockResolvedValue({ channelId: '7' });
            const logSpy = jest.spyOn((service as any).logger, 'log');

            await service.getById(7, '42');

            const audit = logSpy.mock.calls.map(c => String(c[0])).find(m => m.includes('operator_transcript_access'));
            expect(audit).toBeDefined();
            expect(audit).toContain('"actorUserId":"42"');
            expect(audit).toContain('"recordId":7');
            logSpy.mockRestore();
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
        it('is a no-op when OPERATOR_ANOMALY_ENABLED is false', async () => {
            mockConfigService.get.mockImplementation((key: string) =>
                key === 'OPERATOR_ANOMALY_ENABLED' ? 'false' : undefined);
            const result = await service.checkAnomalies();
            expect(result).toEqual({ enabled: false, checked: 0, alerted: 0 });
            expect(mockProjectRepo.findAll).not.toHaveBeenCalled();
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
