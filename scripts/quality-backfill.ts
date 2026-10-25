/** Run with ts-node after the additive migration. Dry-run is the default; no AI/network providers. */
import { Sequelize } from 'sequelize-typescript';
import { DataTypes, QueryTypes } from 'sequelize';
import { QualityAnalysisRun, QualityScorecardRevision } from '../src/operator-analytics/quality/quality-score.models';
import { QualityScoringService } from '../src/operator-analytics/quality/quality-scoring.service';

export async function runQualityBackfill(args: string[], env: NodeJS.ProcessEnv = process.env) {
    const allowed = ['--user', '--project', '--limit', '--after-id', '--apply'];
    if (args.some((arg) => arg.startsWith('--') && !allowed.includes(arg))) throw new Error('Unknown backfill option');
    const option = (key: string) => {
        const i = args.indexOf(key);
        return i < 0 ? undefined : args[i + 1];
    };
    const owner = option('--user'),
        project = Number(option('--project')),
        limit = Number(option('--limit') || 100),
        after = Number(option('--after-id') || 0),
        apply = args.includes('--apply');
    if (
        !owner ||
        !/^\d{1,30}$/.test(owner) ||
        !Number.isSafeInteger(project) ||
        project < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 1000 ||
        !Number.isSafeInteger(after) ||
        after < 0
    )
        throw new Error('Required scope: --user ID --project ID [--limit 1..1000] [--after-id ID] [--apply]');
    if (env.DB_DIALECT !== 'postgres') throw new Error('This backfill runner is qualified for PostgreSQL only');
    const db = new Sequelize({
        dialect: 'postgres',
        host: env.DB_HOST,
        port: Number(env.DB_PORT || 5432),
        username: env.DB_USER,
        password: env.DB_PASS,
        database: env.DB_NAME,
        logging: false,
        models: [QualityAnalysisRun, QualityScorecardRevision],
    });
    // Minimal mappings deliberately avoid starting the application, schedulers, migrations or providers.
    const analytics = db.define(
        'BackfillAnalytics',
        {
            channelId: DataTypes.STRING,
            metrics: DataTypes.JSON,
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
            qualitySummary: DataTypes.JSON,
        },
        { tableName: 'aiAnalytics', timestamps: true }
    );
    const cdrs = db.define(
        'BackfillCdr',
        { channelId: DataTypes.STRING, userId: DataTypes.STRING, projectId: DataTypes.INTEGER },
        { tableName: 'aiCdr', timestamps: false }
    );
    const attributes = {
        channelId: DataTypes.STRING,
        userId: DataTypes.STRING,
        projectId: DataTypes.INTEGER,
        metricId: DataTypes.STRING,
        origin: DataTypes.STRING,
        numValue: DataTypes.FLOAT,
        boolValue: DataTypes.BOOLEAN,
        strValue: DataTypes.TEXT,
    };
    const values = db.define(
        'BackfillValues',
        {
            ...attributes,
            schemaVersion: DataTypes.INTEGER,
            qualityRunId: DataTypes.STRING,
            qualityStatus: DataTypes.STRING,
            normalizedValue: DataTypes.FLOAT,
            qualityWeight: DataTypes.FLOAT,
            contributesToQuality: DataTypes.BOOLEAN,
        },
        { tableName: 'operator_metric_values', timestamps: true, updatedAt: false }
    );
    const overrides = db.define(
        'BackfillOverrides',
        {
            channelId: DataTypes.STRING,
            userId: DataTypes.STRING,
            metricId: DataTypes.STRING,
            origin: DataTypes.STRING,
            numValue: DataTypes.FLOAT,
            boolValue: DataTypes.BOOLEAN,
            strValue: DataTypes.TEXT,
            actorUserId: DataTypes.STRING,
            note: DataTypes.TEXT,
            status: DataTypes.STRING,
        },
        { tableName: 'operator_metric_overrides', timestamps: false }
    );
    const service = new QualityScoringService(
        QualityAnalysisRun,
        QualityScorecardRevision,
        analytics as any,
        cdrs as any,
        values as any,
        overrides as any
    );
    try {
        const rows = await db.query<{ id: number; channelId: string }>(
            `SELECT c.id,c."channelId" FROM "aiCdr" c JOIN "aiAnalytics" a ON a."channelId"=c."channelId" WHERE c."userId"=:owner AND c."projectId"=:project AND c.id>:after AND a."qualityRunId" IS NULL ORDER BY c.id LIMIT :limit`,
            { replacements: { owner, project, after, limit }, type: QueryTypes.SELECT }
        );
        const summary = {
            mode: apply ? 'apply' : 'dry-run',
            examined: 0,
            changed: 0,
            scored: 0,
            needsReview: 0,
            unscorable: 0,
            nextAfterId: after,
        };
        for (const row of rows) {
            const result = await service.backfill(row.channelId, owner, apply);
            summary.examined++;
            summary.changed += Number(result.changed);
            summary.nextAfterId = row.id;
            if ('result' in result)
                summary[
                    result.result.status === 'scored'
                        ? 'scored'
                        : result.result.status === 'needs_review'
                        ? 'needsReview'
                        : 'unscorable'
                ]++;
        }
        return summary;
    } finally {
        await db.close();
    }
}
if (require.main === module)
    runQualityBackfill(process.argv.slice(2))
        .then((result) => console.log(JSON.stringify(result)))
        .catch(() => {
            console.error(
                'Quality backfill failed; no credentials or call data logged. Check scope, migration and database configuration.'
            );
            process.exitCode = 1;
        });
