import { InsightsCacheService } from './insights-cache.service';
import type { OperatorInsightsResponse } from './lib/insights-schema';
import { INSIGHTS_PROMPT_VERSION } from './lib/insights-schema';

function buildInsightsCacheKey(
    tenantUserId: string,
    query: {
        projectId?: number;
        startDate?: string;
        endDate?: string;
        operatorName?: string;
    },
    factsDigest: string,
): string {
    return [
        'insights:v1',
        tenantUserId,
        query.projectId ?? 'all',
        query.startDate || '',
        query.endDate || '',
        query.operatorName || '',
        INSIGHTS_PROMPT_VERSION,
        factsDigest,
    ].join(':');
}

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

    it('uses different cache keys for different tenants with otherwise identical inputs', () => {
        const digest = 'facts-digest-abc';
        const filters = {
            projectId: 1,
            startDate: '2026-01-01',
            endDate: '2026-01-31',
        };
        const tenantA = buildInsightsCacheKey('tenant-a', filters, digest);
        const tenantB = buildInsightsCacheKey('tenant-b', filters, digest);
        expect(tenantA).not.toBe(tenantB);
        expect(tenantA).toContain('tenant-a');
        expect(tenantB).toContain('tenant-b');
    });
});
