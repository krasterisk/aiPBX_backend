import {User} from "../users/users.model";
import {Role} from "../roles/roles.model";
import {UserRoles} from "../roles/user-roles.model";
import {VpbxUser} from "../vpbx_users/vpbx_users.model";
import {SequelizeModuleOptions} from "@nestjs/sequelize";

export const getMysqlConfig = async (): Promise<SequelizeModuleOptions> => {
    return {
        dialect: "mysql",
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT),
        username: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASS,
        database: process.env.MYSQL_DB,
        models: [User,
            Role,
            UserRoles,
            VpbxUser,
        ],
        // logging: (...msg) => console.log(msg),
        autoLoadModels: true,
        // sync: {alter: true}

    }

}
