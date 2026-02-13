import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { BillingService } from './billing.service';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { Prices } from '../prices/prices.model';
import { BillingRecord } from './billing-record.model';
import { UsersService } from '../users/users.service';
import { OpenAiUsage } from './interfaces/openai-usage.interface';

describe('BillingService', () => {
    let service: BillingService;
    let mockAiCdrRepository: any;
    let mockPricesRepository: any;
    let mockBillingRecordRepository: any;
    let mockUsersService: any;

    const mockCdr = {
        channelId: 'test-channel-123',
        userId: '1',
        tokens: 0,
        cost: 0,
        increment: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrice = {
        userId: 1,
        realtime: 35,  // $35 per 1M audio tokens
        text: 5,       // $5 per 1M text tokens
        analytic: 2,   // $2 per 1M analytic tokens
    };

    const mockRecord = {
        audioTokens: 0,
        textTokens: 0,
        totalTokens: 0,
        audioCost: 0,
        textCost: 0,
        totalCost: 0,
        increment: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        mockAiCdrRepository = { findOne: jest.fn() };
        mockPricesRepository = { findOne: jest.fn() };
        mockBillingRecordRepository = {
            findOrCreate: jest.fn().mockResolvedValue([mockRecord, true]),
            findOne: jest.fn(),
        };
        mockUsersService = { decrementUserBalance: jest.fn().mockResolvedValue(true) };

        mockCdr.increment.mockClear();
        mockCdr.update.mockClear();
        mockRecord.increment.mockClear();
        mockRecord.update.mockClear();
        mockRecord.audioTokens = 0;
        mockRecord.textTokens = 0;
        mockRecord.totalTokens = 0;
        mockRecord.totalCost = 0;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: getModelToken(AiCdr), useValue: mockAiCdrRepository },
                { provide: getModelToken(Prices), useValue: mockPricesRepository },
                { provide: getModelToken(BillingRecord), useValue: mockBillingRecordRepository },
                { provide: UsersService, useValue: mockUsersService },
            ],
        }).compile();

        service = module.get<BillingService>(BillingService);
    });

    // ─── accumulateRealtimeTokens ────────────────────────────────────────

    describe('accumulateRealtimeTokens', () => {
        const fullUsage: OpenAiUsage = {
            input_tokens: 6577,
            output_tokens: 299,
            total_tokens: 6876,
            input_token_details: { text_tokens: 5977, audio_tokens: 600 },
            output_token_details: { text_tokens: 63, audio_tokens: 236 },
        };

        it('should findOrCreate a record and increment with correct token breakdown', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);

            await service.accumulateRealtimeTokens('test-channel-123', fullUsage);

            expect(mockBillingRecordRepository.findOrCreate).toHaveBeenCalledWith({
                where: { channelId: 'test-channel-123', type: 'realtime' },
                defaults: { channelId: 'test-channel-123', type: 'realtime' },
            });
            expect(mockRecord.increment).toHaveBeenCalledWith({
                audioTokens: 836,       // 600 + 236
                textTokens: 6040,       // 5977 + 63
                totalTokens: 6876,
            });
        });

        it('should increment cached tokens total in CDR', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            await service.accumulateRealtimeTokens('test-channel-123', fullUsage);
            expect(mockCdr.increment).toHaveBeenCalledWith({ tokens: 6876 });
        });

        it('should skip when CDR not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(null);
            await service.accumulateRealtimeTokens('nonexistent', fullUsage);
            expect(mockBillingRecordRepository.findOrCreate).not.toHaveBeenCalled();
        });

        it('should not increment when token details are missing', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            await service.accumulateRealtimeTokens('test-channel-123', {
                input_tokens: 100, output_tokens: 50, total_tokens: 150,
            });
            expect(mockBillingRecordRepository.findOrCreate).not.toHaveBeenCalled();
        });

        it('should not increment when all token counts are zero', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            await service.accumulateRealtimeTokens('test-channel-123', {
                input_tokens: 0, output_tokens: 0, total_tokens: 0,
                input_token_details: { text_tokens: 0, audio_tokens: 0 },
                output_token_details: { text_tokens: 0, audio_tokens: 0 },
            });
            expect(mockBillingRecordRepository.findOrCreate).not.toHaveBeenCalled();
        });
    });

    // ─── finalizeCallBilling ─────────────────────────────────────────────

    describe('finalizeCallBilling', () => {
        const realtimeRecord = {
            audioTokens: 836, textTokens: 6040, totalTokens: 6876,
            audioCost: 0, textCost: 0, totalCost: 0,
            update: jest.fn().mockResolvedValue(undefined),
        };
        const analyticRecord = { totalTokens: 512, totalCost: 0.001024 };

        it('should calculate costs using correct price rates for single realtime record', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            mockBillingRecordRepository.findOne
                .mockResolvedValueOnce(realtimeRecord)
                .mockResolvedValueOnce(analyticRecord);

            const result = await service.finalizeCallBilling('test-channel-123');

            // audioCost = 836 * 35/1M = 0.02926
            expect(result.audioCost).toBeCloseTo(0.02926, 5);
            // textCost = 6040 * 5/1M = 0.0302
            expect(result.textCost).toBeCloseTo(0.0302, 5);
            expect(result.audioTokens).toBe(836);
            expect(result.textTokens).toBe(6040);
            expect(result.analyticTokens).toBe(512);
            expect(result.analyticCost).toBeCloseTo(0.001024, 5);
        });

        it('should update the realtime record with calculated costs', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            mockBillingRecordRepository.findOne
                .mockResolvedValueOnce(realtimeRecord)
                .mockResolvedValueOnce(null);

            await service.finalizeCallBilling('test-channel-123');

            expect(realtimeRecord.update).toHaveBeenCalledWith({
                audioCost: expect.closeTo(0.02926, 5),
                textCost: expect.closeTo(0.0302, 5),
                totalCost: expect.closeTo(0.05946, 5),
            });
        });

        it('should deduct only realtime cost from balance', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            mockBillingRecordRepository.findOne
                .mockResolvedValueOnce(realtimeRecord)
                .mockResolvedValueOnce(null);

            const result = await service.finalizeCallBilling('test-channel-123');
            expect(mockUsersService.decrementUserBalance).toHaveBeenCalledWith(
                '1', result.audioCost + result.textCost,
            );
        });

        it('should return zero when CDR not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(null);
            const result = await service.finalizeCallBilling('nonexistent');
            expect(result.totalCost).toBe(0);
        });

        it('should return zero when price not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(null);
            const result = await service.finalizeCallBilling('test-channel-123');
            expect(result.totalCost).toBe(0);
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });

        it('should handle no realtime or analytic records gracefully', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            mockBillingRecordRepository.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(null);

            const result = await service.finalizeCallBilling('test-channel-123');
            expect(result.totalCost).toBe(0);
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });
    });

    // ─── chargeAnalytics ─────────────────────────────────────────────────

    describe('chargeAnalytics', () => {
        it('should findOrCreate an analytic record and increment', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);

            await service.chargeAnalytics('test-channel-123', 1000);

            expect(mockBillingRecordRepository.findOrCreate).toHaveBeenCalledWith({
                where: { channelId: 'test-channel-123', type: 'analytic' },
                defaults: { channelId: 'test-channel-123', type: 'analytic' },
            });
            expect(mockRecord.increment).toHaveBeenCalledWith({
                totalTokens: 1000,
                totalCost: 0.002, // 1000 * 2/1M
            });
        });

        it('should increment cached totals in CDR', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            await service.chargeAnalytics('test-channel-123', 1000);
            expect(mockCdr.increment).toHaveBeenCalledWith({ tokens: 1000, cost: 0.002 });
        });

        it('should deduct balance immediately', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(mockPrice);
            await service.chargeAnalytics('test-channel-123', 1000);
            expect(mockUsersService.decrementUserBalance).toHaveBeenCalledWith('1', 0.002);
        });

        it('should return 0 when CDR not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(null);
            const cost = await service.chargeAnalytics('nonexistent', 1000);
            expect(cost).toBe(0);
        });

        it('should return 0 when price not found', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue(null);
            const cost = await service.chargeAnalytics('test-channel-123', 1000);
            expect(cost).toBe(0);
        });

        it('should not deduct balance when analytic price is 0', async () => {
            mockAiCdrRepository.findOne.mockResolvedValue(mockCdr);
            mockPricesRepository.findOne.mockResolvedValue({ ...mockPrice, analytic: 0 });
            const cost = await service.chargeAnalytics('test-channel-123', 1000);
            expect(cost).toBe(0);
            expect(mockUsersService.decrementUserBalance).not.toHaveBeenCalled();
        });
    });
});
