import { QualityPreviewService } from './quality-preview.service';
import { QualityPreviewAnalytics } from './quality-preview-analytics.model';
import { QualityPreviewValue } from './quality-preview-values.model';
import { QualityPreviewOverride } from './quality-preview-overrides.model';
import { QualityPreviewRun, QualityPreviewScorecard, QualityPreviewRules } from './quality-preview.models';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { Client } from 'pg';
import { Sequelize } from 'sequelize-typescript';
import { DataTypes } from 'sequelize';
import { QualityAnalysisRun, QualityScorecardRevision } from './quality-score.models';
import { QualityScoringService } from './quality-scoring.service';
import { createQualityScorecard } from './quality-score';
import { qualityDashboard, qualityEvidence, qualityDistributionPredicate } from './quality-dashboard';
import { spawnSync } from 'child_process';

const url = process.env.QUALITY_TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname))
    throw new Error('Quality tests require a local isolated PostgreSQL');
const suite = url ? describe : describe.skip;
suite('quality storage: real PostgreSQL migration and transactions', () => {
    const schema = 'q1_' + randomUUID().replace(/-/g, '');
    let db: Sequelize,
        admin: Client,
        analytics: any,
        cdrs: any,
        values: any,
        overrides: any,
        service: QualityScoringService;
    const card = () => createQualityScorecard({ id: 5, visibleDefaultMetrics: ['greeting_quality'] }, '99');
    const metrics = (score: number) => ({
        greeting_quality: score,
        csat: 4,
        success: true,
        _criterion_statuses: { greeting_quality: 'assessed' },
    });
    const write = (score: number, operationId: string = randomUUID()) =>
        service.writeAnalysis({
            userId: '99',
            projectId: 5,
            channelId: 'one',
            operationId,
            card: card(),
            fields: { metrics: metrics(score), summary: 'Synthetic', csat: 4 },
        });
    beforeAll(async () => {
        admin = new Client({ connectionString: url });
        await admin.connect();
        await admin.query(`CREATE SCHEMA "${schema}"`);
        db = new Sequelize(url, {
            dialect: 'postgres',
            logging: false,
            dialectOptions: { options: '-c search_path=' + schema },
            pool: { max: 3, min: 0 },
            models: [QualityAnalysisRun, QualityScorecardRevision, QualityPreviewAnalytics, QualityPreviewValue, QualityPreviewOverride, QualityPreviewRun, QualityPreviewScorecard, QualityPreviewRules],
        });
        await db.query(`CREATE TABLE operator_projects (id INTEGER PRIMARY KEY);
            CREATE TABLE "aiCdr" (id SERIAL PRIMARY KEY,"channelId" VARCHAR(255) NOT NULL UNIQUE,"userId" VARCHAR(255) NOT NULL,"projectId" INTEGER NULL,"createdAt" TIMESTAMPTZ DEFAULT NOW(),duration DOUBLE PRECISION,cost DOUBLE PRECISION,"amountCurrency" DOUBLE PRECISION,"operatorId" VARCHAR(255),"assistantName" VARCHAR(255),"callType" VARCHAR(24));
            CREATE TABLE "aiAnalytics" (id SERIAL PRIMARY KEY,"channelId" VARCHAR(255) NOT NULL UNIQUE,metrics JSONB NOT NULL,summary TEXT,sentiment VARCHAR(255),csat DOUBLE PRECISION,cost DOUBLE PRECISION,tokens INTEGER,"createdAt" TIMESTAMPTZ DEFAULT NOW(),"updatedAt" TIMESTAMPTZ DEFAULT NOW());
            CREATE TABLE operator_metric_values (id SERIAL PRIMARY KEY,"channelId" VARCHAR(255),"userId" VARCHAR(255),"projectId" INTEGER,"metricId" VARCHAR(255),origin VARCHAR(24),"schemaVersion" INTEGER,"numValue" DOUBLE PRECISION,"boolValue" BOOLEAN,"strValue" TEXT);
            CREATE TABLE operator_metric_overrides (id SERIAL PRIMARY KEY,"channelId" VARCHAR(255),"userId" VARCHAR(255),"actorUserId" VARCHAR(255),"metricId" VARCHAR(255),origin VARCHAR(24),"numValue" DOUBLE PRECISION,"boolValue" BOOLEAN,"strValue" TEXT,note TEXT);`);
        const migration = readFileSync(
            resolve(process.cwd(), 'migrations/postgres/2026-10-25-quality-score-v2.sql'),
            'utf8'
        );
        await db.query(migration);
        await db.query(migration);
        await db.query('ALTER TABLE operator_metric_values ADD COLUMN "createdAt" TIMESTAMPTZ DEFAULT NOW()');
        analytics = db.define(
            'TestAnalytics',
            {
                channelId: DataTypes.STRING,
                metrics: DataTypes.JSONB,
                summary: DataTypes.TEXT,
                csat: DataTypes.FLOAT,
                sentiment: DataTypes.STRING,
                qualityRunId: DataTypes.STRING,
                qualityScorecardId: DataTypes.STRING,
                qualityScore: DataTypes.FLOAT,
                qualityStatus: DataTypes.STRING,
                qualityCoverage: DataTypes.FLOAT,
                qualityVersion: DataTypes.STRING,
                qualityContextIncomplete: DataTypes.BOOLEAN,
                qualitySummary: DataTypes.JSONB,
            },
            { tableName: 'aiAnalytics', timestamps: true }
        );
        cdrs = db.define(
            'TestCdr',
            { channelId: DataTypes.STRING, userId: DataTypes.STRING, projectId: DataTypes.INTEGER },
            { tableName: 'aiCdr', timestamps: false }
        );
        values = db.define(
            'TestValue',
            {
                channelId: DataTypes.STRING,
                userId: DataTypes.STRING,
                projectId: DataTypes.INTEGER,
                metricId: DataTypes.STRING,
                origin: DataTypes.STRING,
                schemaVersion: DataTypes.INTEGER,
                numValue: DataTypes.FLOAT,
                boolValue: DataTypes.BOOLEAN,
                strValue: DataTypes.TEXT,
                qualityRunId: DataTypes.STRING,
                qualityStatus: DataTypes.STRING,
                normalizedValue: DataTypes.FLOAT,
                qualityWeight: DataTypes.FLOAT,
                contributesToQuality: DataTypes.BOOLEAN,
            },
            { tableName: 'operator_metric_values', timestamps: false }
        );
        overrides = db.define(
            'TestOverride',
            {
                channelId: DataTypes.STRING,
                userId: DataTypes.STRING,
                actorUserId: DataTypes.STRING,
                metricId: DataTypes.STRING,
                origin: DataTypes.STRING,
                status: DataTypes.STRING,
                numValue: DataTypes.FLOAT,
                boolValue: DataTypes.BOOLEAN,
                strValue: DataTypes.TEXT,
                note: DataTypes.TEXT,
            },
            { tableName: 'operator_metric_overrides', timestamps: false }
        );
        await db.query('ALTER TABLE operator_metric_overrides ADD COLUMN "createdAt" TIMESTAMPTZ DEFAULT NOW(), ADD COLUMN "updatedAt" TIMESTAMPTZ DEFAULT NOW()');
        const previewMigration = readFileSync(resolve(process.cwd(), 'migrations/postgres/2026-10-25-quality-preview.sql'), 'utf8');
        await db.query(previewMigration); await db.query(previewMigration);
        await db.query(`ALTER TABLE operator_projects ADD COLUMN "userId" VARCHAR(255), ADD COLUMN "visibleDefaultMetrics" JSONB, ADD COLUMN "customMetricsSchema" JSONB`);
        await db.query(`INSERT INTO operator_projects (id,"userId","visibleDefaultMetrics") VALUES (5,'99','["greeting_quality"]')`);
        service = new QualityScoringService(
            QualityAnalysisRun,
            QualityScorecardRevision,
            analytics,
            cdrs,
            values,
            overrides
        );
    }, 30000);
    beforeEach(async () => {
        await db.query(
            'TRUNCATE quality_analysis_runs, quality_scorecard_revisions, "aiAnalytics", "aiCdr", operator_metric_values, operator_metric_overrides RESTART IDENTITY CASCADE'
        );
        await cdrs.create({ channelId: 'one', userId: '99', projectId: 5 });
    });
    afterAll(async () => {
        await db?.close();
        if (admin) {
            await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            await admin.end();
        }
    });
    it('publishes one score and one immutable run, retries idempotently, and preserves the prior result on regeneration', async () => {
        const first = await write(100, 'attempt-one');
        const retry = await write(0, 'attempt-one');
        expect(retry.id).toBe(first.id);
        expect((await analytics.findOne()).qualityScore).toBe(100);
        const second = await write(0, 'attempt-two');
        expect(second.previousRunId).toBe(first.id);
        expect((await QualityAnalysisRun.findByPk(first.id)).rawSnapshot.metrics.greeting_quality).toBe(100);
        expect((await analytics.findOne()).qualityScore).toBe(0);
        expect(await QualityAnalysisRun.count()).toBe(2);
        expect((await values.findOne({ where: { origin: 'default' } })).normalizedValue).toBe(0);
    });
    it('rolls back score, history and raw answer together if a read projection write fails', async () => {
        const first = await write(100);
        const fault = jest.spyOn(values, 'bulkCreate').mockRejectedValueOnce(new Error('synthetic projection failure'));
        await expect(write(0)).rejects.toThrow('synthetic projection failure');
        fault.mockRestore();
        expect(await QualityAnalysisRun.count()).toBe(1);
        const active = await analytics.findOne();
        expect(active.qualityRunId).toBe(first.id);
        expect(active.metrics.greeting_quality).toBe(100);
    });
    it('preserves pre-migration raw metrics before replacing them and makes derived backfill idempotent', async () => {
        await analytics.create({
            channelId: 'one',
            metrics: { greeting_quality: 75, _schema_version: 2 },
            summary: 'Old',
        });
        const dry = await service.backfill('one', '99');
        expect(dry.changed).toBe(false);
        expect(await QualityAnalysisRun.count()).toBe(0);
        await service.backfill('one', '99', true);
        await service.backfill('one', '99', true);
        expect(await QualityAnalysisRun.count()).toBe(1);
        expect((await analytics.findOne()).metrics.greeting_quality).toBe(75);
        expect((await analytics.findOne()).qualityContextIncomplete).toBe(true);
        await write(100);
        expect(await QualityAnalysisRun.count()).toBe(2);
    });
    it('captures a legacy baseline even when regeneration occurs before backfill', async () => {
        await analytics.create({ channelId: 'one', metrics: { greeting_quality: 25 }, summary: 'Original' });
        const next = await write(100);
        const previous = await QualityAnalysisRun.findByPk(next.previousRunId);
        expect(previous.kind).toBe('legacy_baseline');
        expect(previous.rawSnapshot.metrics.greeting_quality).toBe(25);
    });
    it('runs the bounded backfill CLI in dry-run by default and applies it idempotently without starting the app or AI', async () => {
        await analytics.create({ channelId: 'one', metrics: { greeting_quality: 75 } });
        const connection = new URL(url);
        const env = {
            ...process.env,
            PGOPTIONS: '-c search_path=' + schema,
            DB_DIALECT: 'postgres',
            DB_HOST: connection.hostname,
            DB_PORT: connection.port,
            DB_USER: decodeURIComponent(connection.username),
            DB_PASS: decodeURIComponent(connection.password),
            DB_NAME: connection.pathname.slice(1),
        };
        // The CLI is a standalone process; sequelize-typescript model classes must not rebind the test app's connection.
        const source = `const {runQualityBackfill:run}=require('./scripts/quality-backfill');(async()=>{const args=['--user','99','--project','5','--limit','1'];const dry=await run(args);const applied=await run([...args,'--apply']);const retry=await run([...args,'--apply']);console.log(JSON.stringify([dry,applied,retry]));})().catch(()=>{process.exitCode=1});`;
        const child = spawnSync(
            process.execPath,
            ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register', '-e', source],
            { cwd: process.cwd(), env, encoding: 'utf8', windowsHide: true, timeout: 90000 }
        );
        expect(child.status).toBe(0);
        const [dry, applied, retry] = JSON.parse(child.stdout.trim());
        expect(dry).toEqual(expect.objectContaining({ mode: 'dry-run', examined: 1, changed: 0, scored: 1 }));
        expect(applied.changed).toBe(1);
        expect(retry.changed).toBe(0);
        expect(await QualityAnalysisRun.count()).toBe(1);
        expect((await analytics.findOne()).metrics.greeting_quality).toBe(75);
    }, 120000);
    it('preserves existing supervisor corrections in backfill but never reapplies them to a new AI evaluation', async () => {
        await analytics.create({ channelId: 'one', metrics: { greeting_quality: 100 } });
        await overrides.create({
            channelId: 'one',
            userId: '99',
            actorUserId: '99',
            metricId: 'greeting_quality',
            origin: 'default',
            numValue: 20,
        });
        await service.backfill('one', '99', true);
        expect((await analytics.findOne()).qualityScore).toBe(20);
        const old = (await analytics.findOne()).qualityRunId;
        await write(80);
        expect((await analytics.findOne()).qualityScore).toBe(80);
        expect(await overrides.count()).toBe(0);
        expect((await QualityAnalysisRun.findByPk(old)).result.score).toBe(20);
    });
    it('scopes detail and cursor history, omits private prompt context, and handles timestamp ties without losing runs', async () => {
        await write(25);
        await write(50);
        const current = await write(75);
        await db.query(`UPDATE quality_analysis_runs SET "createdAt"='2026-10-25T10:00:00Z'`);
        const one = await service.history('one', '99', false, 1);
        const two = await service.history('one', '99', false, 1, one[0].id);
        const three = await service.history('one', '99', false, 1, two[0].id);
        expect(new Set([one[0].id, two[0].id, three[0].id]).size).toBe(3);
        expect(await service.history('one', '99', false, 1, three[0].id)).toEqual([]);
        await expect(service.history('one', '99', false, 1, randomUUID())).rejects.toThrow('Invalid history cursor');
        const detail = await service.detail('one', '99', false);
        expect(detail.evaluation.id).toBe(current.id);
        expect(JSON.stringify(detail)).not.toContain('systemPrompt');
        await expect(service.detail('one', 'foreign', false, current.id)).rejects.toThrow();
        await expect(service.detail('one', '99', false, randomUUID())).rejects.toThrow('Evaluation not found');
    });
    it('serializes concurrent writers so neither prior evaluation disappears', async () => {
        const [a, b] = await Promise.all([write(25), write(75)]);
        expect(await QualityAnalysisRun.count()).toBe(2);
        expect(a.previousRunId === b.id || b.previousRunId === a.id).toBe(true);
    });
    it('applies and removes a human correction as new revisions, preserving raw AI and the stored rubric', async () => {
        const base = await write(100);
        await service.reviseOverrides('one', '99', 'supervisor', [
            { metricId: 'greeting_quality', numValue: 0, note: 'Synthetic correction' },
        ]);
        expect((await analytics.findOne()).qualityScore).toBe(0);
        expect((await analytics.findOne()).metrics.greeting_quality).toBe(100);
        expect((await QualityAnalysisRun.findByPk(base.id)).result.score).toBe(100);
        await service.reviseOverrides('one', '99', 'supervisor', [], 'greeting_quality');
        expect((await analytics.findOne()).qualityScore).toBe(100);
        expect(await QualityAnalysisRun.count()).toBe(3);
    });
    it('supports reasoned applicability corrections and idempotent removal without erasing AI or silently creating zero', async () => {
        await write(100);
        await expect(
            service.reviseOverrides('one', '99', 'supervisor', [
                { metricId: 'greeting_quality', status: 'not_applicable' },
            ])
        ).rejects.toThrow();
        await service.reviseOverrides('one', '99', 'supervisor', [
            {
                metricId: 'greeting_quality',
                status: 'not_applicable',
                note: 'The beginning is outside this call scenario',
            },
        ]);
        expect((await analytics.findOne()).qualityScore).toBeNull();
        const active = await QualityAnalysisRun.findByPk((await analytics.findOne()).qualityRunId);
        expect(active.result.criteria[0]).toEqual(
            expect.objectContaining({ status: 'not_applicable', source: 'human', value: null })
        );
        expect(active.rawSnapshot.metrics.greeting_quality).toBe(100);
        expect((await service.reviseOverrides('one', '99', 'supervisor', [], 'greeting_quality')).deleted).toBe(1);
        expect((await service.reviseOverrides('one', '99', 'supervisor', [], 'greeting_quality')).deleted).toBe(0);
        expect(await QualityAnalysisRun.count()).toBe(3);
        expect((await analytics.findOne()).qualityScore).toBe(100);
    });
    it('rejects foreign access and deletes sensitive run snapshots with the original record', async () => {
        await write(100);
        await expect(service.history('one', 'foreign', false)).rejects.toThrow();
        await expect(
            service.writeAnalysis({
                channelId: 'one',
                userId: 'foreign',
                projectId: 5,
                operationId: 'foreign',
                card: card(),
                fields: { metrics: metrics(0) },
            })
        ).rejects.toThrow();
        expect(await QualityAnalysisRun.count()).toBe(1);
        await analytics.destroy({ where: { channelId: 'one' } });
        expect(await QualityAnalysisRun.count()).toBe(0);
    });
    it('aggregates published scores, corrected metric evidence and scoped call types in SQL without a JSON score formula', async () => {
        await db.query(
            `UPDATE "aiCdr" SET "createdAt"='2026-10-25T10:00:00Z',"assistantName"='Synthetic',"operatorId"='218',duration=30`
        );
        await write(100);
        await cdrs.create({ channelId: 'two', userId: '99', projectId: 5 });
        await service.writeAnalysis({
            userId: '99',
            projectId: 5,
            channelId: 'two',
            operationId: 'two',
            card: card(),
            fields: { metrics: metrics(0) },
        });
        await db.query(
            `UPDATE "aiCdr" SET "createdAt"='2026-10-25T11:00:00Z',"assistantName"='Synthetic',"operatorId"='218',"callType"='outgoing',duration=60 WHERE "channelId"='two'`
        );
        const filters = { startDate: '2026-10-25T00:00:00Z', endDate: '2026-10-25T23:59:59Z', projectId: 5 };
        const result = await qualityDashboard(db, filters, false, '99');
        expect(result.averageScore).toBe(50);
        expect(result.scoredCalls).toBe(2);
        expect(result.timeSeries.hourly).toHaveLength(24);
        expect(result.timeSeries.daily[0]).toEqual(
            expect.objectContaining({
                avgScore: 50,
                callsCount: 2,
                byCallType: { incoming: 1, outgoing: 1, internal: 0 },
            })
        );
        expect(result.agentScorecards[0].averageScore).toBe(50);
        await service.reviseOverrides('one', '99', 'supervisor', [
            { metricId: 'greeting_quality', numValue: 20, note: 'Human reason' },
        ]);
        await service.reviseOverrides('one', '99', 'supervisor', [
            { metricId: 'success', origin: 'summary', boolValue: false, note: 'Outcome correction' },
        ]);
        const [effective]: any = await db.query(
            `SELECT count(*)::int AS n FROM "aiCdr" AS "AiCdr" WHERE "AiCdr"."userId"='99' AND ${qualityDistributionPredicate(
                { success: false }
            )}`,
            { type: 'SELECT' as any }
        );
        expect(effective.n).toBe(1);
        const evidence = await qualityEvidence(db, filters, false, '99', {
            metricId: 'greeting_quality',
            evidencePageSize: 1,
        });
        expect(evidence.averageScore).toBe(10);
        expect(evidence.metrics.find((m: any) => m.metricId === 'greeting_quality')).toEqual(
            expect.objectContaining({ average: 10, evidenceTotal: 2 })
        );
        const next = await qualityEvidence(db, filters, false, '99', {
            metricId: 'greeting_quality',
            evidencePageSize: 1,
            evidencePage: 2,
        });
        expect(next.metrics.find((m: any) => m.metricId === 'greeting_quality').evidence[0].rationale).toBe(
            'Human reason'
        );
        expect((await qualityDashboard(db, filters, false, 'foreign')).averageScore).toBeNull();
        expect((await qualityDashboard(db, { ...filters, callType: 'outgoing' }, false, '99')).averageScore).toBe(0);
    });
    it('normalizes custom evidence using frozen scales, orders reverse-polarity answers by quality, and reads summary in one SQL query', async () => {
        const rubric = createQualityScorecard(
            {
                id: 5,
                visibleDefaultMetrics: ['greeting_quality'],
                customMetricsSchema: [
                    { id: 'wait', name: 'Wait', type: 'number', min: 0, max: 5, polarity: 'negative' },
                ],
                qualityScoreConfig: { criteria: { 'custom:wait': { included: true } } },
            },
            '99'
        );
        await cdrs.create({ channelId: 'two', userId: '99', projectId: 5 });
        for (const [channelId, wait] of [
            ['one', 1],
            ['two', 4],
        ] as const)
            await service.writeAnalysis({
                userId: '99',
                projectId: 5,
                channelId,
                operationId: channelId,
                card: rubric,
                fields: {
                    metrics: {
                        greeting_quality: 100,
                        custom_metrics: { wait },
                        _criterion_statuses: { 'default:greeting_quality': 'assessed', 'custom:wait': 'assessed' },
                    },
                },
            });
        const evidence = await qualityEvidence(db, { projectId: 5 }, false, '99', { metricId: 'wait' });
        const item = evidence.metrics.find((m: any) => m.metricId === 'wait');
        expect(item.normalizedAverage).toBeCloseTo(50);
        expect(item.evidence[0]).toEqual(expect.objectContaining({ channelId: 'two', value: 4 }));
        expect(item.evidence[0].normalizedScore).toBeCloseTo(20);
        const querySpy = jest.spyOn(db, 'query');
        const dashboard = await qualityDashboard(db, { projectId: 5 }, false, '99');
        expect(querySpy).toHaveBeenCalledTimes(1);
        querySpy.mockRestore();
        expect(dashboard.averageScore).toBeCloseTo(75);
    });
    it('isolates preview values, rules, corrections and immutable history from the old scheme', async () => {
        await analytics.create({ channelId: 'one', metrics: metrics(100), summary: 'Synthetic', csat: 4 });
        await overrides.create({ channelId: 'one', userId: '99', actorUserId: '99', metricId: 'greeting_quality', origin: 'default', numValue: 50 });
        const original = (await analytics.findOne({ where: { channelId: 'one' } })).toJSON();
        const oldCorrections = (await overrides.findAll()).map(row => row.toJSON());
        const project = { id: 5, userId: '99', get: () => ({ id: 5, visibleDefaultMetrics: ['greeting_quality'] }) };
        const projects = { findOne: jest.fn(async (query) => query.where.userId && query.where.userId !== '99' ? null : project) };
        const preview = new QualityPreviewService(QualityPreviewRun, QualityPreviewScorecard, QualityPreviewAnalytics,
            QualityPreviewValue, QualityPreviewOverride, QualityPreviewRules, analytics, cdrs, projects as any, undefined, overrides);
        await expect(preview.ensure('one', '1')).rejects.toThrow('not found');
        await preview.ensure('one', '99');
        expect((await preview.scoring.detail('one', '99', false)).evaluation.result.score).toBe(50);
        expect(await QualityPreviewRun.count()).toBe(1);
        await preview.ensure('one', '99');
        expect(await QualityPreviewRun.count()).toBe(1);
        await preview.scoring.reviseOverrides('one', '99', '99', [{ metricId: 'greeting_quality', numValue: 75, note: 'Synthetic correction' }]);
        expect((await preview.scoring.detail('one', '99', false)).evaluation.result.score).toBe(75);
        await preview.rules(5, '99', false, { minimumCoverage: 1, criteria: { 'default:greeting_quality': { weight: 2 } } });
        await preview.ensure('one', '99');
        expect((await preview.scoring.detail('one', '99', false)).evaluation.result.score).toBe(75);
        expect((await preview.scoring.history('one', '99', false)).length).toBe(2);
        expect((await analytics.findOne({ where: { channelId: 'one' } })).toJSON()).toEqual(original);
        expect((await overrides.findAll()).map(row => row.toJSON())).toEqual(oldCorrections);
        expect(await values.count()).toBe(0);
        expect(await QualityAnalysisRun.count()).toBe(0);
        await expect(preview.rules(5, '1', false, {})).rejects.toThrow('not found');
        await expect(preview.scoring.detail('one', '1', false)).rejects.toThrow('not found');
        const first = (await preview.scoring.history('one', '99', false)).at(-1);
        const row = await analytics.findOne({ where: { channelId: 'one' } });
        await row.update({ metrics: metrics(25) });
        await preview.ensure('one', '99');
        expect((await preview.scoring.detail('one', '99', false)).evaluation.result.score).toBe(25);
        expect((await preview.scoring.detail('one', '99', false, first.id)).evaluation.result.score).toBe(50);
    });

    it('runs isolated preview backfill as a separate process: dry-run, apply, retry and original-data invariant', async () => {
        await analytics.create({ channelId: 'one', metrics: { greeting_quality: 75 }, csat: 4 });
        const original = (await analytics.findOne()).toJSON();
        const connection = new URL(url);
        const env = { ...process.env, PGOPTIONS: '-c search_path=' + schema, DB_DIALECT: 'postgres',
            DB_HOST: connection.hostname, DB_PORT: connection.port, DB_USER: decodeURIComponent(connection.username),
            DB_PASS: decodeURIComponent(connection.password), DB_NAME: connection.pathname.slice(1) };
        const source = `const {runQualityPreviewBackfill:run}=require('./src/operator-analytics/quality/quality-preview-backfill');(async()=>{const args=['--user','99','--project','5','--limit','1'];console.log(JSON.stringify([await run(args),await run([...args,'--apply']),await run([...args,'--apply'])]));})().catch(()=>{process.exitCode=1});`;
        const child = spawnSync(process.execPath, ['-r','ts-node/register','-e',source], { cwd: process.cwd(), env, encoding:'utf8', windowsHide:true, timeout:90000 });
        expect(child.status).toBe(0);
        const [dry,applied,retry] = JSON.parse(child.stdout.trim());
        expect(dry).toMatchObject({ mode:'dry-run', examined:1, changed:0 });
        expect(applied).toMatchObject({ changed:1, scored:1 });
        expect(retry.changed).toBe(0);
        expect((await analytics.findOne()).toJSON()).toEqual(original);
        expect(await QualityAnalysisRun.count()).toBe(0);
    }, 120000);

});
