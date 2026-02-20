#!/usr/bin/env node

/**
 * MySQL → PostgreSQL data migration script
 * Uses mysql2 (supports caching_sha2_password) and pg
 *
 * Usage:
 *   MYSQL_URL=mysql://root:pass@host:3306/aiPBX \
 *   PG_URL=postgresql://user:pass@host:5432/dbname \
 *   node scripts/migrate-mysql-to-pg.js
 */

const mysql = require('mysql2/promise');
const { Client } = require('pg');

const MYSQL_URL = process.env.MYSQL_URL;
const PG_URL = process.env.PG_URL;

if (!MYSQL_URL || !PG_URL) {
    console.error('Usage: MYSQL_URL=... PG_URL=... node scripts/migrate-mysql-to-pg.js');
    process.exit(1);
}

// MySQL type → PostgreSQL type mapping for value conversion
function formatValue(val, type) {
    if (val === null) return null;
    if (Buffer.isBuffer(val)) {
        // TINYINT(1) comes as Buffer in mysql2
        if (val.length === 1) return val[0];
        return val.toString('hex');
    }
    if (val instanceof Date) return val.toISOString();
    return val;
}

async function migrate() {
    console.log('Connecting to MySQL...');
    const mysqlConn = await mysql.createConnection(MYSQL_URL);
    console.log('MySQL connected.');

    console.log('Connecting to PostgreSQL...');
    const pgClient = new Client({ connectionString: PG_URL });
    await pgClient.connect();
    console.log('PostgreSQL connected.');

    // Get all tables
    const [tables] = await mysqlConn.query('SHOW TABLES');
    const tableKey = Object.keys(tables[0])[0];
    const tableNames = tables.map(t => t[tableKey]);

    console.log(`Found ${tableNames.length} tables: ${tableNames.join(', ')}\n`);

    // Disable FK checks for the session
    await pgClient.query(`SET session_replication_role = 'replica'`);
    console.log('Foreign key checks disabled.\n');

    let totalRows = 0;

    for (const table of tableNames) {
        try {
            // Get rows from MySQL
            const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);

            if (rows.length === 0) {
                console.log(`  ${table}: empty, skipping`);
                continue;
            }

            // Check if table exists in PostgreSQL
            const tableCheck = await pgClient.query(
                `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
                [table]
            );

            if (!tableCheck.rows[0].exists) {
                console.log(`  ${table}: table not found in PostgreSQL, skipping`);
                continue;
            }

            // Get PostgreSQL columns for this table
            const pgColsResult = await pgClient.query(
                `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
                [table]
            );
            const pgColNames = new Set(pgColsResult.rows.map(r => r.column_name));

            // Only use columns that exist in BOTH MySQL and PostgreSQL
            const mysqlColumns = Object.keys(rows[0]);
            const columns = mysqlColumns.filter(c => pgColNames.has(c));
            const skippedCols = mysqlColumns.filter(c => !pgColNames.has(c));

            if (skippedCols.length > 0) {
                console.log(`  ${table}: skipping columns not in PG: ${skippedCols.join(', ')}`);
            }

            const pgColumns = columns.map(c => `"${c}"`).join(', ');

            // Truncate target table first
            await pgClient.query(`TRUNCATE TABLE "${table}" CASCADE`);

            // Insert rows in batches
            let inserted = 0;

            for (const row of rows) {
                const values = columns.map(c => formatValue(row[c]));
                const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

                try {
                    await pgClient.query(
                        `INSERT INTO "${table}" (${pgColumns}) VALUES (${placeholders})`,
                        values
                    );
                    inserted++;
                } catch (err) {
                    if (err.code !== '23505') {
                        console.error(`    Row error in ${table}: ${err.message}`);
                    }
                }
            }

            // Fix sequence (auto-increment)
            try {
                await pgClient.query(`
                    SELECT setval(
                        pg_get_serial_sequence('"${table}"', 'id'),
                        COALESCE(MAX(id), 0) + 1, false
                    ) FROM "${table}"
                `);
            } catch (e) {
                // Table might not have 'id' column or sequence
            }

            console.log(`  ${table}: ${inserted}/${rows.length} rows migrated`);
            totalRows += inserted;

        } catch (err) {
            console.error(`  ${table}: ERROR - ${err.message}`);
        }
    }

    // Re-enable FK checks
    await pgClient.query(`SET session_replication_role = 'origin'`);
    console.log(`\nForeign key checks re-enabled.`);
    console.log(`Done! Total: ${totalRows} rows migrated.`);

    await mysqlConn.end();
    await pgClient.end();
}

migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
