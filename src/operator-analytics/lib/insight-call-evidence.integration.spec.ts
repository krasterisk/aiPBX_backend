import { randomUUID } from 'crypto';
import { Sequelize } from 'sequelize';
import { insightCallEvidence } from './insight-call-evidence';
import type { VerifiedInsight } from './verified-insights';
import { QUALITY_FORMULA_VERSION } from '../quality/quality-score';

const url = process.env.QUALITY_TEST_DATABASE_URL;
if (url && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw new Error('Local QA only');
(url ? describe : describe.skip)('actionable insight scoped PostgreSQL sources', () => {
    const schema = 'actionable_' + randomUUID().replace(/-/g, '');
    let db: Sequelize, admin: Sequelize;
    const filters = { userId: '100', projectId: 5, startDate: '2026-10-01T00:00:00Z', endDate: '2026-10-31T23:59:59.999Z', sources: '["external-api"]', callTypes: '["incoming"]', people: '[{"userId":"99","operatorId":"207"}]', tagIds: '["booking"]', csat: '4' };
    const instruction = 'При новой записи повторить дату и время; для получения результатов критерий неприменим.';
    const rule = { id: 'confirmation', origin: 'custom', type: 'boolean', name: 'Подтверждение', normalization: { kind: 'points', values: { true: 1, false: 0 }, maxPoints: 1 }, weight: 1, included: true, critical: 'none' } as const;
    const fact = (ids: string[]): VerifiedInsight => ({ priority: 'high', type: 'gap', title: '', observation: '', recommendation: '', evidence: {
        factId: 'verified', metricId: 'confirmation', origin: 'custom', metric: 'Подтверждение', rule, value: 0, unit: 'points', assessed: 12, applicable: 12, notApplicable: 0, notRecorded: 0,
        distribution: {}, channelIds: ids, previousChannelIds: ['20'], period: { startDate: filters.startDate, endDate: filters.endDate },
    } });
    beforeAll(async () => {
        admin = new Sequelize(url!, { logging: false });
        await admin.query(`CREATE SCHEMA "${schema}"`);
        db = new Sequelize(url!, { logging: false, dialectOptions: { options: '-c search_path=' + schema } });
        await db.query(`CREATE TABLE "aiCdr" ("channelId" text PRIMARY KEY,"userId" text,"projectId" int,"createdAt" timestamptz,duration int,cost float,"amountCurrency" float,"operatorId" text,"assistantId" text,"assistantName" text,source text,"callType" text);
          CREATE TABLE quality_preview_analytics ("channelId" text PRIMARY KEY,"qualityVersion" text,"qualityRunId" text,"qualityScorecardId" text,"qualityStatus" text,"qualityScore" float,"qualityCoverage" float,"qualityContextIncomplete" bool,metrics jsonb,"qualitySummary" jsonb,sentiment text,csat int);
          CREATE TABLE quality_preview_runs (id text PRIMARY KEY,"userId" text,"channelId" text,"scorecardRevisionId" text,"rawSnapshot" jsonb,result jsonb);
          CREATE TABLE quality_preview_scorecards (id text,"userId" text,snapshot jsonb);
          CREATE TABLE operator_analytics (id int,"userId" text,transcription text);`);
        await db.query(`INSERT INTO quality_preview_scorecards VALUES ('card','99',:snapshot::jsonb),('foreign-card','100',:snapshot::jsonb)`, { replacements: { snapshot: JSON.stringify({ criteria: [rule], context: { systemPrompt: 'Исторический контекст синтетического проекта.', customMetricsSchema: [{ id: rule.id, description: instruction }], callTaxonomy: [{ id: 'booking', name: 'Новая запись' }] } }) } });
        for (let i = 1; i <= 12; i++) {
            const text = 'Клиент: Запишите меня на консультацию. Оператор: Запись оформлена, до свидания. Клиент: Мой телефон +79001234567, почта patient@example.com.';
            await db.query(`INSERT INTO "aiCdr" VALUES (:id,'99',5,'2026-10-15Z',30,0,0,'207',NULL,'Name','external-api','incoming');
              INSERT INTO quality_preview_analytics VALUES (:id,:version,:run,'card','scored',0,1,false,'{"_topics":{"tags":["booking"]}}','{}',NULL,4);
              INSERT INTO quality_preview_runs VALUES (:run,'99',:id,'card',:raw::jsonb,:result::jsonb);
              INSERT INTO operator_analytics VALUES (:num,:oaOwner,:stored)`, { replacements: { id: String(i), num: i, version: QUALITY_FORMULA_VERSION, run: 'run-' + i,
                raw: JSON.stringify(i === 1 ? { input: { transcription: text } } : {}),
                result: JSON.stringify({ criteria: [{ id: 'confirmation', origin: 'custom', status: i === 5 ? 'not_applicable' : 'assessed', rationale: 'Параметры не повторены.', quote: 'Запись оформлена, до свидания.' }] }),
                oaOwner: i === 4 ? '100' : '99', stored: i === 3 ? 'enc:v1:unreadable' : text,
            } });
        }
        await db.query(`UPDATE quality_preview_analytics SET "qualityRunId"='foreign-run' WHERE "channelId"='6';
          INSERT INTO quality_preview_runs VALUES ('foreign-run','100','6','foreign-card','{}','{}');
          UPDATE "aiCdr" SET source='widget' WHERE "channelId"='7';
          UPDATE "aiCdr" SET "createdAt"='2026-09-15Z' WHERE "channelId"='8';`);
        await db.query(`UPDATE operator_analytics SET transcription=:long WHERE id=9`, { replacements: { long: 'Длинный обрезанный разговор. '.repeat(300) } });
    }, 30000);
    afterAll(async () => { await db?.close(); if (admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.close(); } });

    it('uses only selected scoped current runs, supports legacy transcripts and removes contacts before prompting', async () => {
        const rows = await insightCallEvidence(db, filters, false, '99', [fact(['1', '2', '9'])], 'current');
        expect(rows.map(r => r.channelId)).toEqual(['1', '2']);
        expect(rows.every(r => r.instruction === instruction && r.complete)).toBe(true);
        expect(rows[0].topics).toEqual(['Новая запись']);
        expect(rows[0].businessContext).toBe('Исторический контекст синтетического проекта.');
        expect(rows[0].runId).toBe('run-1');
        expect(rows[1].runId).toBe('run-2');
        expect(JSON.stringify(rows)).not.toMatch(/79001234567|patient@example/);
        expect(rows[0].transcript).toContain('[телефон]');
        expect(rows[0].assessment.quote).toBe('Запись оформлена, до свидания.');
    });
    it('cannot fall through to another tenant, stale run, N/A, unreadable ciphertext or an unselected source/period', async () => {
        for (const ids of [['3', '4'], ['5', '6'], ['7', '8']]) expect(await insightCallEvidence(db, filters, false, '99', [fact(ids)], 'current')).toEqual([]);
    });
    it('uses another exact exemplar when an earlier conversation would be truncated', async () => {
        const rows = await insightCallEvidence(db, filters, false, '99', [fact(['9', '1', '2'])], 'current');
        expect(rows.map(r => r.channelId)).toEqual(['1', '2']);
        expect(rows.every(r => r.complete)).toBe(true);
    });
    it('enforces owner for clients and cabinet selection for administrators even when IDs are supplied', async () => {
        expect(await insightCallEvidence(db, { ...filters, userId: '100' }, true, '99', [fact(['1', '2'])], 'current')).toEqual([]);
        expect(await insightCallEvidence(db, { ...filters, projectId: 6 }, false, '99', [fact(['1', '2'])], 'current')).toEqual([]);
        expect(await insightCallEvidence(db, { ...filters, csat: '5' }, false, '99', [fact(['1', '2'])], 'current')).toEqual([]);
    });
});
