import { randomUUID } from 'crypto';
import { Sequelize } from 'sequelize';
import { insightPeriodData } from './insight-evidence';
import { verifiedInsights } from './verified-insights';
import { QUALITY_FORMULA_VERSION } from '../quality/quality-score';

const url = process.env.QUALITY_TEST_DATABASE_URL;
if (url && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local QA only');
(url ? describe : describe.skip)('verified insight native PostgreSQL evidence', () => {
    const schema = 'insight_' + randomUUID().replace(/-/g, '');
    let db: Sequelize, admin: Sequelize;
    const q = { userId: '100', projectId: 5, startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-31T23:59:59.999Z', sources: '["external-api"]', callTypes: '["incoming"]', people: '[{"userId":"99","operatorId":"207"}]', tagIds: '["booking"]', csat: '4' };
    beforeAll(async () => {
        admin = new Sequelize(url!, { logging: false });
        await admin.query(`CREATE SCHEMA "${schema}"`);
        db = new Sequelize(url!, { logging: false, dialectOptions: { options: '-c search_path=' + schema } });
        await db.query(`CREATE TABLE "aiCdr" ("channelId" text PRIMARY KEY,"userId" text,"projectId" int,"createdAt" timestamptz,duration int,cost float,"amountCurrency" float,"operatorId" text,"assistantId" text,"assistantName" text,source text,"callType" text);
        CREATE TABLE quality_preview_analytics ("channelId" text PRIMARY KEY,"qualityVersion" text,"qualityRunId" text,"qualityScorecardId" text,"qualityStatus" text,"qualityScore" float,"qualityCoverage" float,"qualityContextIncomplete" bool,metrics jsonb,"qualitySummary" jsonb,sentiment text,csat int);
        CREATE TABLE quality_preview_values ("channelId" text,"userId" text,"qualityRunId" text,"metricId" text,origin text,"qualityStatus" text,"strValue" text,"boolValue" bool,"numValue" float,"normalizedValue" float);
        CREATE TABLE quality_preview_scorecards (id text,"userId" text,snapshot jsonb);`);
        const rule = { id: 'confirmation', origin: 'custom', type: 'boolean', name: 'Подтверждение', normalization: { kind: 'points', values: { true: 1, false: 0 }, maxPoints: 1 }, weight: 1, included: true, critical: 'none' };
        await db.query(`INSERT INTO quality_preview_scorecards VALUES ('rules','99',:snapshot::jsonb),('foreign-rules','100',:snapshot::jsonb)`, { replacements: { snapshot: JSON.stringify({ criteria: [rule] }) } });
        for (const period of ['09', '10']) for (let i = 0; i < 12; i++) {
            const id = `${period}-${i}`, value = period === '09' || i < 3;
            await db.query(`INSERT INTO "aiCdr" VALUES (:id,'99',5,:date,30,0,0,'207',NULL,'Same Name','external-api','incoming');
              INSERT INTO quality_preview_analytics VALUES (:id,:version,:run,'rules','scored',50,1,false,'{"_topics":{"tags":["booking"]}}','{}',NULL,4);
              INSERT INTO quality_preview_values VALUES (:id,'99',:run,'confirmation','custom','assessed',NULL,:value,NULL,:normalized);
              INSERT INTO quality_preview_values VALUES (:id,'99','old-run','confirmation','custom','assessed',NULL,false,NULL,0);
              INSERT INTO quality_preview_values VALUES (:id,'100',:run,'confirmation','custom','assessed',NULL,false,NULL,0);`, { replacements: { id, run: 'run-' + id, date: `2026-${period}-15T10:00:00Z`, value, normalized: value ? 1 : 0, version: QUALITY_FORMULA_VERSION } });
        }
        await db.query(`INSERT INTO "aiCdr" VALUES ('foreign','100',5,'2026-10-15Z',30,0,0,'207',NULL,'Same Name','external-api','incoming');
          INSERT INTO quality_preview_analytics VALUES ('foreign',:version,'foreign-run','foreign-rules','scored',0,1,false,'{"_topics":{"tags":["booking"]}}','{}',NULL,4);
          INSERT INTO quality_preview_values VALUES ('foreign','100','foreign-run','confirmation','custom','assessed',NULL,false,NULL,0);`, { replacements: { version: QUALITY_FORMULA_VERSION } });
    }, 30000);
    afterAll(async () => { await db?.close(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.close(); } });

    it('uses the exact scoped population and current run; generated metric examples prove the criterion', async () => {
        const current = await insightPeriodData(db, q, false, '99');
        expect(current.total).toBe(12);
        expect(current.metrics.reduce((n, g) => n + g.n, 0)).toBe(12);
        const previous = await insightPeriodData(db, { ...q, startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-30T23:59:59.999Z' }, false, '99');
        const facts = verifiedInsights(current, previous, { current: { startDate: q.startDate, endDate: q.endDate }, previous: { startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-30T23:59:59.999Z' } }, {});
        const gap = facts.find(f => f.type === 'gap')!;
        expect(gap.evidence.value).toBe(25);
        expect(gap.evidence.distribution).toEqual({ true: 3, false: 9 });
        for (const id of gap.evidence.channelIds) expect(Number(id.split('-')[1])).toBeGreaterThanOrEqual(3);
        const trend = facts.find(f => f.type === 'trend')!;
        expect(trend.evidence.delta).toBe(-75);
        expect(trend.evidence.previousChannelIds.every(id => id.startsWith('09-'))).toBe(true);
    });
    it.each(['sources', 'callTypes', 'people', 'tagIds', 'csat'] as const)('applies the %s facet to metric counts and examples', async key => {
        const invalid = { sources: '["widget"]', callTypes: '["outgoing"]', people: '[{"userId":"99","operatorId":"other"}]', tagIds: '["other"]', csat: '1' };
        const result = await insightPeriodData(db, { ...q, [key]: invalid[key] }, false, '99');
        expect(result.total).toBe(0); expect(result.metrics).toEqual([]);
    });
    it('allows an administrator to scope the chosen cabinet', async () => {
        const result = await insightPeriodData(db, { ...q, people: undefined }, true, '99');
        expect(result.total).toBe(1);
        expect(result.metrics[0].lowIds).toEqual(['foreign']);
    });
});
