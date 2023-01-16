import {Module} from "@nestjs/common";
import {SequelizeModule} from "@nestjs/sequelize";
import { UsersModule } from './users/users.module';
import {ConfigModule} from "@nestjs/config";
import {User} from "./users/users.model";
import { RolesModule } from './roles/roles.module';
import {Role} from "./roles/roles.model";
import {UserRoles} from "./roles/user-roles.model";
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { FilesModule } from './files/files.module';
import {Post} from "./posts/posts.model";
import {ServeStaticModule} from "@nestjs/serve-static";
import { AmiModule } from './ami/ami.module';
import * as path from 'path';
import { EndpointsModule } from './pbx/endpoints/endpoints.module';
import {Endpoint} from "./pbx/endpoints/endpoints.model";
import {UserEndpoints} from "./pbx/endpoints/user-endpoints.model";
import { VpbxUsersModule } from './vpbx_users/vpbx_users.module';
import {VpbxUser} from "./vpbx_users/vpbx_users.model";
import { ContextsModule } from './pbx/contexts/contexts.module';
import { AriModule } from './ari/ari.module';
import { RoutesModule } from './pbx/routes/routes.module';
import { ExtensionsModule } from './pbx/extensions/extensions.module';
import {Route} from "./pbx/routes/routes.model";
import {Extensions} from "./pbx/extensions/extensions.model";
import {RouteExtensions} from "./pbx/extensions/routes-extensions.model";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: `.${process.env.NODE_ENV}.env`
        }),
        ServeStaticModule.forRoot({
            rootPath: path.resolve(__dirname, 'static'),
        }),
        SequelizeModule.forRoot({
            dialect: "mysql",
            host: process.env.MYSQL_HOST,
            port: Number(process.env.MYSQL_PORT),
            username: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASS,
            database: process.env.MYSQL_DB,
            models: [User, Role, UserRoles, Post, Endpoint, UserEndpoints, VpbxUser, Route, Extensions, RouteExtensions],
            autoLoadModels: true,
//            sync: {alter: true}
        }),
        UsersModule,
        RolesModule,
        AuthModule,
        PostsModule,
        FilesModule,
        AmiModule,
        EndpointsModule,
        VpbxUsersModule,
        ContextsModule,
        RoutesModule,
        AriModule,
        ExtensionsModule,
    ],

})

export class AppModule {}