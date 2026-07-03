import { enrichInsightsWithChannelIds } from './insights-drilldown';
import type { OperatorInsight } from './insights-schema';

describe('insights-drilldown', () => {
    const baseInsight: OperatorInsight = {
        priority: 'high',
        type: 'gap',
        title: 'Low greeting',
        observation: 'greeting_quality below average',
        recommendation: 'Train greeting script',
        evidence: {
            metric: 'greeting_quality',
            value: 42,
            operators: ['Иванов А.'],
        },
    };

    it('returns insights unchanged when repository yields no channel IDs', async () => {
        const aiCdrRepository = {
            findAll: jest.fn().mockResolvedValue([]),
        };

        const result = await enrichInsightsWithChannelIds([baseInsight], {
            aiCdrRepository,
            query: { userId: '1', startDate: '2026-01-01', endDate: '2026-01-31' },
            isAdmin: false,
            realUserId: '1',
            likeOp: (v) => ({ like: v }),
        });

        expect(result).toEqual([baseInsight]);
        expect(aiCdrRepository.findAll).toHaveBeenCalled();
    });

    it('attaches exemplar channelIds sorted by metric for gap insights', async () => {
        const aiCdrRepository = {
            findAll: jest.fn().mockResolvedValue([
                {
                    channelId: 'ch-high',
                    analytics: { metrics: { metrics: { greeting_quality: 80 } } },
                },
                {
                    channelId: 'ch-low',
                    analytics: { metrics: { metrics: { greeting_quality: 30 } } },
                },
                {
                    channelId: 'ch-mid',
                    analytics: { metrics: { metrics: { greeting_quality: 55 } } },
                },
            ]),
        };

        const result = await enrichInsightsWithChannelIds([baseInsight], {
            aiCdrRepository,
            query: { userId: '1' },
            isAdmin: false,
            realUserId: '1',
            likeOp: (v) => ({ like: v }),
        });

        expect(result[0].evidence.channelIds).toEqual(['ch-low', 'ch-mid', 'ch-high']);
    });

    it('deduplicates channel IDs and caps at five', async () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({
            channelId: i < 4 ? `ch-${i}` : 'ch-dup',
            analytics: {},
        }));
        const aiCdrRepository = { findAll: jest.fn().mockResolvedValue(rows) };

        const result = await enrichInsightsWithChannelIds(
            [{ ...baseInsight, evidence: { operators: ['Op'] } }],
            {
                aiCdrRepository,
                query: {},
                isAdmin: true,
                realUserId: null,
                likeOp: (v) => ({ like: v }),
            },
        );

        expect(result[0].evidence.channelIds?.length).toBeLessThanOrEqual(5);
        expect(new Set(result[0].evidence.channelIds).size).toBe(result[0].evidence.channelIds?.length);
    });
});
