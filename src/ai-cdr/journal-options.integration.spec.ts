import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { Sequelize } from 'sequelize-typescript';
import { getAssociations } from 'sequelize-typescript/dist/associations/shared/association-service';
import { AiCdrService } from './ai-cdr.service';
import { AiCdr } from './ai-cdr.model';
import { BillingRecord } from '../billing/billing-record.model';
import { OperatorProject } from '../operator-analytics/operator-project.model';
import { CallTag } from '../operator-analytics/operator-call-tag.model';
import { QualityPreviewAnalytics } from '../operator-analytics/quality/quality-preview-analytics.model';

const url = process.env.QUALITY_TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local PostgreSQL only');
(url ? describe : describe.skip)('journal people facet actual ORM tenant and selection scope', () => {
    const schema = 'facet_' + randomUUID().replace(/-/g, '');
    let db: Sequelize, admin: Client, service: AiCdrService;
    const period = { startDate: '2026-10-29T00:00:00.000Z', endDate: '2026-10-29T23:59:59.999Z' };
    beforeAll(async () => {
        admin = new Client({ connectionString: url }); await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`);
        const models = new Set<any>();
        const collect = (model: any) => {
            if (models.has(model)) return;
            models.add(model);
            for (const association of getAssociations(model.prototype) ?? []) collect(association.getAssociatedClass());
        };
        for (const model of [AiCdr, OperatorProject, CallTag]) collect(model);
        db = new Sequelize(url, { dialect: 'postgres', logging: false, dialectOptions: { options: '-c search_path=' + schema }, models: [...models] });
        await db.sync();
        for (const id of [5, 6]) await OperatorProject.create({ id, name: 'Synthetic ' + id, userId: '99', visibleDefaultMetrics: [], customMetricsSchema: [], callTaxonomy: [] } as any);
        for (const item of [
            { channelId: 'own', userId: '99', operatorId: '207', assistantName: 'Own operator', projectId: 5, source: 'external-api', callType: 'incoming', csat: 4, tag: 'service', summary: 'needle' },
            { channelId: 'bot', userId: '99', assistantId: '7', assistantName: 'Own robot', projectId: 5, source: 'external-api', callType: 'incoming', csat: 4, tag: 'service', summary: 'needle' },
            { channelId: 'other', userId: '99', operatorId: '218', assistantName: 'Other project', projectId: 6, source: 'call', callType: 'outgoing', csat: 2, tag: 'booking', summary: 'other' },
            { channelId: 'old', userId: '99', assistantId: 'old', assistantName: 'Historical robot', projectId: 5, source: 'external-api', callType: 'incoming', csat: 4, tag: 'service', summary: 'needle' },
            { channelId: 'foreign', userId: '100', operatorId: '207', assistantName: 'Foreign operator', projectId: 5, source: 'external-api', callType: 'incoming', csat: 4, tag: 'service', summary: 'needle' },
        ]) {
            const { csat, tag, summary, ...cdr } = item;
            await AiCdr.create({ ...cdr, createdAt: new Date(item.channelId === 'old' ? '2026-10-28T12:00:00Z' : '2026-10-29T12:00:00Z') } as any);
            await QualityPreviewAnalytics.create({ channelId: item.channelId, csat, summary, metrics: {} } as any);
            await CallTag.create({ channelId: item.channelId, userId: item.userId, projectId: item.projectId, tagId: tag } as any);
        }
        service = Object.assign(Object.create(AiCdrService.prototype), { dialect: 'postgres', aiCdrRepository: AiCdr, callTagRepository: CallTag, billingRecordRepository: BillingRecord });
    }, 60000);
    afterAll(async () => {
        await db?.close();
        if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
    });
    const identities = (result: Awaited<ReturnType<AiCdrService['getJournalOptions']>>) => result.people.map(p => JSON.parse(p.value));

    it('ignores a forged tenant and excludes historical identities', async () => {
        const result = await service.getJournalOptions({ ...period, userId: '100' } as any, false, '99');
        expect(identities(result)).toEqual(expect.arrayContaining([{ userId: '99', operatorId: '207' }, { userId: '99', operatorId: '218' }, { userId: '99', assistantId: '7' }]));
        expect(result.people).toHaveLength(3);
        expect(result.people.some(p => /Foreign|Historical/.test(p.label))).toBe(false);
    });
    it('matches the current journal filters and ignores only the people facet itself', async () => {
        const query = { ...period, userId: '100', projectId: '5', sources: '["external-api"]', callTypes: '["incoming"]', csat: '4', tagIds: '["service"]', search: 'needle' };
        const result = await service.getJournalOptions({ ...query, people: '[{"userId":"99","operatorId":"207"}]' } as any, false, '99');
        expect(identities(result)).toEqual(expect.arrayContaining([{ userId: '99', operatorId: '207' }, { userId: '99', assistantId: '7' }]));
        expect(result.people).toHaveLength(2);
        const journal = await service.get({ ...query, page: 1, limit: 20 } as any, false, '99', true, true);
        expect(journal.rows.map(r => r.channelId).sort()).toEqual(['bot', 'own']);
    });
    it('returns no unrelated options for an empty selection or a foreign project', async () => {
        expect((await service.getJournalOptions({ ...period, projectId: '6', csat: '4' } as any, false, '99')).people).toEqual([]);
        expect((await service.getJournalOptions({ ...period, tagIds: '["nonexistent"]' } as any, false, '99')).people).toEqual([]);
    });
    it('restricts an admin to the explicitly selected cabinet', async () => {
        expect(identities(await service.getJournalOptions({ ...period, userId: '100' } as any, true, null))).toEqual([{ userId: '100', operatorId: '207' }]);
    });
});
