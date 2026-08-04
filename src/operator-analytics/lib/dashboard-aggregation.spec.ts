import { buildDashboardCdrWhere, findChannelIdsForDistribution } from './dashboard-aggregation';
import { Op } from 'sequelize';

describe('dashboard-aggregation', () => {
    const likeOp = (v: string) => ({ [Op.like]: v });

    it('buildDashboardCdrWhere scopes non-admin to realUserId', () => {
        const where = buildDashboardCdrWhere({}, false, '42', likeOp);
        expect(where.userId).toBe('42');
    });

    it('buildDashboardCdrWhere applies project and operator filters', () => {
        const where = buildDashboardCdrWhere(
            { projectId: 5, operatorName: 'Alice', startDate: '2026-01-01', endDate: '2026-01-31' },
            true,
            '1',
            likeOp,
        );
        expect(where.projectId).toBe(5);
        expect(where.assistantName).toEqual({ [Op.like]: '%Alice%' });
        expect(where.createdAt?.[Op.between]).toHaveLength(2);
    });

    it('buildDashboardCdrWhere uses exact equality for operatorNameExact', () => {
        const where = buildDashboardCdrWhere(
            { operatorNameExact: 'Иван' },
            true,
            '1',
            likeOp,
        );
        expect(where.assistantName).toBe('Иван');
    });

    it('buildDashboardCdrWhere keeps substring behaviour for operatorName', () => {
        const where = buildDashboardCdrWhere(
            { operatorName: 'Иван' },
            true,
            '1',
            likeOp,
        );
        expect(where.assistantName).toEqual({ [Op.like]: '%Иван%' });
    });

    it('buildDashboardCdrWhere prefers exact filter when both operator filters are supplied', () => {
        const where = buildDashboardCdrWhere(
            { operatorName: 'Иван', operatorNameExact: 'Иван Петров' },
            true,
            '1',
            likeOp,
        );
        expect(where.assistantName).toBe('Иван Петров');
    });

    describe('findChannelIdsForDistribution', () => {
        it('joins metric_values to aiCdr with tenant/date scope (not mv.userId)', async () => {
            const query = jest.fn().mockResolvedValue([[{ channelId: '11' }]]);
            const sequelize = {
                getDialect: () => 'mysql',
                query,
            } as any;

            const ids = await findChannelIdsForDistribution(
                sequelize,
                { startDate: '2026-08-03', endDate: '2026-08-09', projectId: 2 },
                false,
                '42',
                { sentiment: 'positive' },
            );

            expect(ids).toEqual(['11']);
            const [sql, opts] = query.mock.calls[0];
            expect(sql).toContain('operator_metric_values');
            expect(sql).toContain('aiCdr');
            expect(sql).not.toContain('mv.`userId`');
            expect(opts.replacements).toMatchObject({
                sentiment: 'positive',
                userId: '42',
                projectId: 2,
            });
        });

        it('falls back to aiAnalytics when metric_values miss', async () => {
            const query = jest.fn()
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ channelId: '99' }]]);
            const sequelize = {
                getDialect: () => 'postgres',
                query,
            } as any;

            const ids = await findChannelIdsForDistribution(
                sequelize,
                {},
                true,
                '1',
                { sentiment: 'neutral' },
            );

            expect(ids).toEqual(['99']);
            expect(query.mock.calls[1][0]).toContain('aiAnalytics');
        });
    });
});
