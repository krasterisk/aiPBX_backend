import { buildDashboardCdrWhere } from './dashboard-aggregation';
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
});
