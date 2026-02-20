import { User } from "../users/users.model";
import { Role } from "../roles/roles.model";
import { UserRoles } from "../roles/user-roles.model";
import { VpbxUser } from "../vpbx_users/vpbx_users.model";
import { SequelizeModuleOptions } from "@nestjs/sequelize";
import { Sequelize } from "sequelize";
import { Logger } from "@nestjs/common";

const logger = new Logger('DatabaseConfig');

/**
 * Ensure the target database exists, creating it if necessary.
 * Returns true if the database was newly created.
 */
async function ensureDatabaseExists(
    dialect: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
): Promise<boolean> {
    const tempDb = dialect === 'postgres' ? 'postgres' : undefined;
    let created = false;

    const sequelize = new Sequelize({
        dialect: dialect as 'mysql' | 'postgres',
        host,
        port,
        username,
        password,
        database: tempDb,
        logging: false,
    });

    try {
        if (dialect === 'postgres') {
            const [results] = await sequelize.query(
                `SELECT 1 FROM pg_database WHERE datname = '${database}'`
            );
            if (results.length === 0) {
                await sequelize.query(`CREATE DATABASE "${database}"`);
                logger.log(`Database "${database}" created successfully (PostgreSQL)`);
                created = true;
            }
        } else {
            // Check if MySQL database exists before creating
            const [results] = await sequelize.query(
                `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${database}'`
            );
            if ((results as any[]).length === 0) {
                await sequelize.query(`CREATE DATABASE \`${database}\``);
                logger.log(`Database "${database}" created successfully (MySQL)`);
                created = true;
            }
        }
    } catch (error) {
        logger.error(`Failed to ensure database "${database}": ${error.message}`);
    } finally {
        await sequelize.close();
    }

    return created;
}

/**
 * Seed default roles (ADMIN, USER) into a freshly created database.
 */
async function seedDefaultRoles(
    dialect: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
): Promise<void> {
    const sequelize = new Sequelize({
        dialect: dialect as 'mysql' | 'postgres',
        host,
        port,
        username,
        password,
        database,
        logging: false,
    });

    try {
        // Create roles table and seed default roles
        if (dialect === 'postgres') {
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS roles (
                    id SERIAL PRIMARY KEY,
                    value VARCHAR(255) UNIQUE NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    "createdAt" TIMESTAMP DEFAULT NOW(),
                    "updatedAt" TIMESTAMP DEFAULT NOW()
                )
            `);
            await sequelize.query(`
                INSERT INTO roles (value, description) VALUES ('ADMIN', 'Admin')
                ON CONFLICT (value) DO NOTHING
            `);
            await sequelize.query(`
                INSERT INTO roles (value, description) VALUES ('USER', 'Customer')
                ON CONFLICT (value) DO NOTHING
            `);
        } else {
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS roles (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    value VARCHAR(255) UNIQUE NOT NULL,
                    description VARCHAR(255) NOT NULL,
                    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
            await sequelize.query(`
                INSERT IGNORE INTO roles (value, description) VALUES ('ADMIN', 'Admin')
            `);
            await sequelize.query(`
                INSERT IGNORE INTO roles (value, description) VALUES ('USER', 'Customer')
            `);
        }

        logger.log('Default roles (ADMIN, USER) seeded successfully');
    } catch (error) {
        logger.error(`Failed to seed default roles: ${error.message}`);
    } finally {
        await sequelize.close();
    }
}

export const getDatabaseConfig = async (): Promise<SequelizeModuleOptions> => {
    const dialect = (process.env.DB_DIALECT as 'mysql' | 'postgres') || 'mysql';
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT);
    const username = process.env.DB_USER;
    const password = process.env.DB_PASS;
    const database = process.env.DB_NAME;

    const isNewDatabase = await ensureDatabaseExists(dialect, host, port, username, password, database);

    if (isNewDatabase) {
        await seedDefaultRoles(dialect, host, port, username, password, database);
    }

    return {
        dialect,
        host,
        port,
        username,
        password,
        database,
        models: [User,
            Role,
            UserRoles,
            VpbxUser,
        ],
        logging: false,
        // logging: (...msg) => console.log(msg),
        autoLoadModels: true,
        synchronize: true,
        // sync: {alter: true}

    }
}
