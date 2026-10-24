/** Add the nullable topic scheme column before deploying the new project model. */
const { Sequelize, DataTypes } = require('sequelize');

async function migrateTopicScheme(database) {
    const query = database.getQueryInterface();
    const columns = await query.describeTable('operator_projects');
    if (columns.topicSchemeState) return;
    try {
        await query.addColumn('operator_projects', 'topicSchemeState', {
            type: database.getDialect() === 'postgres' ? DataTypes.JSONB : DataTypes.JSON,
            allowNull: true,
        });
    } catch (error) {
        // Concurrent deployments can share a database. Only duplicate-column errors are safe.
        if (!['42701', 'ER_DUP_FIELDNAME'].includes(error.original?.code)) throw error;
    }
}

async function main() {
    const dialect = process.env.DB_DIALECT || 'mysql';
    if (!['postgres', 'mysql'].includes(dialect)) throw new Error('Unsupported DB_DIALECT');
    for (const key of ['DB_HOST', 'DB_NAME', 'DB_USER']) {
        if (!process.env[key]) throw new Error(`Missing ${key}`);
    }
    const database = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
        dialect, host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || (dialect === 'postgres' ? 5432 : 3306), logging: false,
    });
    try {
        await database.authenticate();
        await migrateTopicScheme(database);
        console.log('Topic scheme column ready; all existing project settings preserved');
    } finally {
        await database.close();
    }
}

module.exports = { migrateTopicScheme };
if (require.main === module || !require.main) main().catch(() => {
    console.error('Topic scheme migration failed; backend deployment stopped');
    process.exitCode = 1;
});
