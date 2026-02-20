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

    let totalRows = 0;

    for (const table of tableNames) {
        try {
            // Get rows from MySQL
            const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);

            if (rows.length === 0) {
                console.log(`  ${table}: empty, skipping`);
                continue;
            }

            const columns = Object.keys(rows[0]);
            const pgColumns = columns.map(c => `"${c}"`).join(', ');

            // Check if table exists in PostgreSQL
            const tableCheck = await pgClient.query(
                `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
                [table]
            );

            if (!tableCheck.rows[0].exists) {
                console.log(`  ${table}: table not found in PostgreSQL, skipping`);
                continue;
            }

            // Truncate target table first
            await pgClient.query(`TRUNCATE TABLE "${table}" CASCADE`);

            // Insert rows in batches
            let inserted = 0;
            const batchSize = 100;

            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize);

                for (const row of batch) {
                    const values = columns.map(c => formatValue(row[c]));
                    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

                    try {
                        await pgClient.query(
                            `INSERT INTO "${table}" (${pgColumns}) VALUES (${placeholders})`,
                            values
                        );
                        inserted++;
                    } catch (err) {
                        // Skip duplicate key errors, log others
                        if (err.code !== '23505') {
                            console.error(`    Row error in ${table}: ${err.message}`);
                        }
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

    console.log(`\nDone! Total: ${totalRows} rows migrated.`);

    await mysqlConn.end();
    await pgClient.end();
}

migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
