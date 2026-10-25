import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { Sequelize } from 'sequelize-typescript';
import { getAssociations } from 'sequelize-typescript/dist/associations/shared/association-service';
import { OperatorAnalyticsService } from '../operator-analytics.service';
import { AiCdr } from '../../ai-cdr/ai-cdr.model';
import { AiAnalytics } from '../../ai-analytics/ai-analytics.model';
import { OperatorAnalytics } from '../operator-analytics.model';
import { OperatorProject } from '../operator-project.model';
import { MetricValue } from '../operator-metric-value.model';
import { CallTag } from '../operator-call-tag.model';

const url = process.env.QUALITY_TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local PostgreSQL only');
(url ? describe : describe.skip)('dashboard counts versus actual ORM drilldown', () => {
    const schema = 'c3_' + randomUUID().replace(/-/g, '');
    let db: Sequelize, admin: Client, service: OperatorAnalyticsService;
    const q = { projectId: 5, startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-02T23:59:59.999Z' };
    beforeAll(async () => {
        admin = new Client({ connectionString: url }); await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`);
        const models = new Set<any>();
        const collect = (model: any) => { if (models.has(model)) return; models.add(model);
            for (const association of getAssociations(model.prototype) ?? []) collect(association.getAssociatedClass()); };
        for (const model of [AiCdr, OperatorAnalytics, OperatorProject, MetricValue, CallTag]) collect(model);
        db = new Sequelize(url, { dialect: 'postgres', logging: false, dialectOptions: { options: '-c search_path=' + schema }, models: [...models] });
        await db.sync();
        await OperatorProject.create({ id: 5, name: 'Synthetic', userId: '99', visibleDefaultMetrics: ['greeting_quality'], customMetricsSchema: [], callTaxonomy: [] } as any);
        // More than the former 5000-ID cap; same timestamps also qualify stable summary paging.
        await db.query(`INSERT INTO "aiCdr" ("channelId","userId","projectId","createdAt","updatedAt","callType",duration,cost,"assistantName","operatorId",source)
          SELECT 'large-'||n,'99',5,'2026-10-01T02:15:00Z','2026-10-01T02:15:00Z',CASE n%3 WHEN 0 THEN 'incoming' WHEN 1 THEN 'outgoing' ELSE 'internal' END,30,0,'Operator','pbx:7','external-api' FROM generate_series(1,6005)n;
          INSERT INTO "aiAnalytics" ("channelId",metrics,sentiment,"createdAt","updatedAt")
          SELECT 'large-'||n,'{"success":true,"greeting_quality":80,"customer_sentiment":"Positive"}'::json,'Positive',NOW(),NOW() FROM generate_series(1,6005)n;`);
        for (const [id, metrics, day] of [
            ['nested', { scenario_analysis: { success: false } }, '01'],
            ['priority', { success: false, scenario_analysis: { success: true } }, '01'],
            ['string', { success: 'true', customer_sentiment: 'Positive' }, '01'],
            ['low', { success: true, greeting_quality: 20, customer_sentiment: 'Negative', _quality: { quality: 'low' } }, '02'],
            ['unusable', { success: false, greeting_quality: 40, customer_sentiment: 'Neutral', _quality: { quality: 'unusable' } }, '02'],
            ['nul', { success: true, summary: 'hello\u0000world' }, '01'],
            ['none', null, '01'],
        ] as const) {
            await AiCdr.create({ channelId: id, userId: '99', projectId: 5, source: 'external-api', assistantName: 'Operator', operatorId: 'pbx:7',
                callType: id === 'none' ? null : 'incoming', createdAt: new Date(`2026-10-${day}T03:00:00Z`) } as any);
            if (metrics) await AiAnalytics.create({ channelId: id, metrics } as any);
        }
        await AiCdr.create({ channelId: 'foreign', userId: '100', projectId: 5, source: 'external-api', operatorId: 'pbx:7', createdAt: new Date('2026-10-01T02:15:00Z') } as any);
        await AiAnalytics.create({ channelId: 'foreign', metrics: { success: true } });
        // Deliberately stale, partial cache contradicts raw answers. It must not determine call counts.
        await MetricValue.create({ channelId: 'large-1', userId: 'wrong', projectId: 5, metricId: 'success', origin: 'summary', boolValue: false });
        const instance: any = Object.create(OperatorAnalyticsService.prototype);
        Object.assign(instance, { aiCdrRepository: AiCdr, aiAnalyticsRepository: AiAnalytics, analyticsRepository: OperatorAnalytics,
            projectRepository: OperatorProject, metricValueRepository: MetricValue, callTagRepository: CallTag });
        service = instance;
    }, 60000);
    afterAll(async () => { await db?.close(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); } });

    it('matches every displayed day/direction and exact outcome, including low-only days and >5000 successes', async () => {
        const d = await service.getDashboard(q, false, '99');
        expect(d.totalAnalyzed).toBe(6012);
        expect(d.aggregatedMetrics.greeting_quality).toBe(Number(((6005*80+20+40)/6012).toFixed(2)));
        const lowDay = await service.getDashboard({ ...q, startDate: '2026-10-02T00:00:00.000Z' }, false, '99');
        expect(lowDay).toMatchObject({ totalAnalyzed: 2, successfulCount: 1, unsuccessfulCount: 1, unknownOutcomeCount: 0, excludedLowQualityCount: 0 });
        expect(lowDay.aggregatedMetrics.greeting_quality).toBe(30);
        for (const sentiment of ['negative','neutral']) expect((await service.getCdrs({ ...q, sentiment, limit: 1 }, false, '99')).total).toBe(1);
        const adminDay = await service.getDashboard({ ...q, startDate: '2026-10-02T00:00:00.000Z' }, true, '99');
        expect(adminDay.excludedLowQualityCount).toBe(2);
        expect(adminDay.aggregatedMetrics).toEqual(lowDay.aggregatedMetrics);
        expect(d.timeSeries.daily.reduce((sum, point) => sum + point.callsCount, 0)).toBe(d.totalAnalyzed);
        expect(d).toMatchObject({ successfulCount: 6007, unsuccessfulCount: 3, unknownOutcomeCount: 2 });
        for (const point of d.timeSeries.daily) {
            const scope = { ...q, startDate: point.label + 'T00:00:00.000Z', endDate: point.label + 'T23:59:59.999Z', page: 1, limit: 1 };
            expect((await service.getCdrs(scope, false, '99')).total).toBe(point.callsCount);
            for (const callType of ['incoming', 'outgoing', 'internal'] as const)
                expect((await service.getCdrs({ ...scope, callType }, false, '99')).total).toBe(point.byCallType[callType]);
        }
        expect((await service.getCdrs({ ...q, success: true, limit: 1 }, false, '99')).total).toBe(d.successfulCount);
        expect((await service.getCdrs({ ...q, success: false, limit: 1 }, false, '99')).total).toBe(d.unsuccessfulCount);
        expect((await service.getCdrs({ ...q, withoutOutcome: true, limit: 1 }, false, '99')).total).toBe(d.unknownOutcomeCount);
        expect((await service.getCdrs({ ...q, sentiment: 'positive', limit: 1 }, false, '99')).total).toBe(6006);
        expect((await service.getCdrs({ ...q, withoutOutcome: true, sentiment: 'positive', limit: 1 }, false, '99')).total).toBe(1);
    }, 60000);
    it('matches hourly and clipped calendar buckets under account-scoped multi-operator selection', async () => {
        const filters = { ...q, userId: '100', startDate: '2026-10-01T02:30:00.000Z', endDate: '2026-10-01T03:59:59.999Z',
            operatorFilters: JSON.stringify([{ userId: '99', operatorId: 'pbx:7' }]) };
        const d = await service.getDashboard(filters, false, '99');
        expect(d.totalAnalyzed).toBe(5);
        for (const point of d.timeSeries.hourly) {
            const start = Math.max(Date.parse(point.label), Date.parse(filters.startDate));
            const end = Math.min(Date.parse(point.label) + 3600000 - 1, Date.parse(filters.endDate));
            expect((await service.getCdrs({ ...filters, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), limit: 1 }, false, '99')).total).toBe(point.callsCount);
        }
    }, 60000);
});
