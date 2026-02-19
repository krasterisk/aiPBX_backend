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
 */
async function ensureDatabaseExists(
    dialect: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database: string,
): Promise<void> {
    // Connect without specifying a database (MySQL uses no db, Postgres uses 'postgres')
    const tempDb = dialect === 'postgres' ? 'postgres' : undefined;

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
            // PostgreSQL: check if database exists before creating
            const [results] = await sequelize.query(
                `SELECT 1 FROM pg_database WHERE datname = '${database}'`
            );
            if (results.length === 0) {
                await sequelize.query(`CREATE DATABASE "${database}"`);
                logger.log(`Database "${database}" created successfully (PostgreSQL)`);
            }
        } else {
            // MySQL: CREATE DATABASE IF NOT EXISTS is natively supported
            await sequelize.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
            logger.log(`Database "${database}" ensured (MySQL)`);
        }
    } catch (error) {
        logger.error(`Failed to ensure database "${database}": ${error.message}`);
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

    await ensureDatabaseExists(dialect, host, port, username, password, database);

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
