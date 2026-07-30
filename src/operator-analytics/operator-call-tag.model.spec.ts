import * as fs from 'fs';
import * as path from 'path';

describe('CallTag model', () => {
    const postgresMigration = fs.readFileSync(
        path.join(__dirname, '../../migrations/postgres/2026-07-30-operator-call-taxonomy.sql'),
        'utf8',
    );
    const mysqlMigration = fs.readFileSync(
        path.join(__dirname, '../../migrations/mysql/2026-07-30-operator-call-taxonomy.sql'),
        'utf8',
    );
    const modelSource = fs.readFileSync(
        path.join(__dirname, 'operator-call-tag.model.ts'),
        'utf8',
    );

    it('declares channelId, userId, projectId, tagId, source, actorUserId, and createdAt columns', () => {
        for (const col of ['channelId', 'userId', 'projectId', 'tagId', 'source', 'actorUserId']) {
            expect(modelSource).toContain(col);
        }
        expect(modelSource).toMatch(/timestamps:\s*true/);
    });

    it('defaults source to auto', () => {
        expect(modelSource).toMatch(/defaultValue:\s*'auto'/);
        expect(modelSource).toMatch(/@Default\('auto'\)/);
    });

    it('registers CallTag in OperatorAnalyticsModule forFeature', () => {
        const moduleSource = fs.readFileSync(
            path.join(__dirname, 'operator-analytics.module.ts'),
            'utf8',
        );
        expect(moduleSource).toContain('CallTag');
        expect(moduleSource).toMatch(/SequelizeModule\.forFeature\(\[[^\]]*CallTag/);
    });

    it('postgres migration declares callTaxonomy column, tag table, and channel+tag uniqueness', () => {
        expect(postgresMigration).toMatch(/callTaxonomy/i);
        expect(postgresMigration).toMatch(/operator_call_tags/i);
        expect(postgresMigration).toMatch(/uq_call_tags_channel_tag/i);
        expect(postgresMigration).toMatch(/"channelId".*"tagId"/i);
    });

    it('mysql migration declares callTaxonomy column, tag table, and channel+tag uniqueness', () => {
        expect(mysqlMigration).toMatch(/callTaxonomy/i);
        expect(mysqlMigration).toMatch(/operator_call_tags/i);
        expect(mysqlMigration).toMatch(/uq_call_tags_channel_tag/i);
        expect(mysqlMigration).toMatch(/`channelId`.*`tagId`/i);
    });
});
