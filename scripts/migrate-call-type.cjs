/** Add callType before deploying models that select it. Never backfills call rows. */
const { Sequelize, DataTypes } = require('sequelize');

async function migrateCallType(database) {
    const query = database.getQueryInterface();
    const generator = query.queryGenerator;
    for (const table of ['operator_analytics', 'aiCdr']) {
        const columns = await query.describeTable(table);
        if (!columns.callType) {
            try {
                await query.addColumn(table, 'callType', { type: DataTypes.STRING(16), allowNull: true });
            } catch (error) {
                // Another deployment sharing this DB may have added the same column.
                if (!['42701', 'ER_DUP_FIELDNAME'].includes(error.original?.code)) throw error;
            }
        }
        await database.query(`ALTER TABLE ${generator.quoteTable(table)} ALTER COLUMN ${generator.quoteIdentifier('callType')} SET DEFAULT 'incoming'`);
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
        port: Number(process.env.DB_PORT) || (dialect === 'postgres' ? 5432 : 3306),
        logging: false,
    });
    try {
        await database.authenticate();
        await migrateCallType(database);
        console.log('callType columns/defaults ready; historical rows unchanged');
    } finally {
        await database.close();
    }
}

module.exports = { migrateCallType };
// `docker compose exec ... node < script` runs as [stdin], without require.main.
if (require.main === module || !require.main) main().catch(() => {
    // Do not print connection details or a driver error that could contain credentials.
    console.error('callType migration failed; backend deployment stopped');
    process.exitCode = 1;
});
