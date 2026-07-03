import { InsightsCacheService } from './insights-cache.service';
import type { OperatorInsightsResponse } from './lib/insights-schema';

const sampleResponse: OperatorInsightsResponse = {
    insights: [],
    generatedAt: '2026-07-03T00:00:00.000Z',
    promptVersion: 'test',
    sampleSize: 0,
    lowConfidence: false,
};

describe('InsightsCacheService', () => {
    let service: InsightsCacheService;

    beforeEach(async () => {
        delete process.env.REDIS_URL;
        service = new InsightsCacheService();
        await service.onModuleInit();
    });

    afterEach(async () => {
        await service.onModuleDestroy();
    });

    it('returns null on cache miss', async () => {
        await expect(service.get('missing-key')).resolves.toBeNull();
    });

    it('stores and retrieves entries in memory', async () => {
        await service.set('k1', sampleResponse, 60_000);
        await expect(service.get('k1')).resolves.toEqual(sampleResponse);
    });

    it('expires in-memory entries after TTL', async () => {
        jest.useFakeTimers();
        await service.set('k2', sampleResponse, 1000);
        jest.advanceTimersByTime(1500);
        await expect(service.get('k2')).resolves.toBeNull();
        jest.useRealTimers();
    });
});
