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
import { RecordsModule } from './pbx/records/records.module';
import {Record} from "./pbx/records/record.model";
import { PermitsController } from './pbx/permits/permits.controller';
import { PermitsService } from './pbx/permits/permits.service';
import { PermitsModule } from './pbx/permits/permits.module';
import { ListbookModule } from './pbx/listbook/listbook.module';
import { BlacklistModule } from './pbx/blacklist/blacklist.module';
import { CallbackService } from './pbx/callback/callback.service';
import { CallbackModule } from './pbx/callback/callback.module';
import { AppsController } from './pbx/apps/apps.controller';
import { AppsService } from './pbx/apps/apps.service';
import { AppsModule } from './pbx/apps/apps.module';
import { IvrController } from './pbx/ivr/ivr.controller';
import { IvrModule } from './pbx/ivr/ivr.module';
import { QueueService } from './pbx/queue/queue.service';
import { QueueController } from './pbx/queue/queue.controller';
import { QueueModule } from './pbx/queue/queue.module';
import { GroupsModule } from './pbx/groups/groups.module';
import { PromptService } from './pbx/prompt/prompt.service';
import { PromptController } from './pbx/prompt/prompt.controller';
import { PromptModule } from './pbx/prompt/prompt.module';
import { MohModule } from './pbx/moh/moh.module';
import { TimegroupModule } from './pbx/timegroup/timegroup.module';

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
            models: [User,
                Role,
                UserRoles,
                VpbxUser,
            ],
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
        RecordsModule,
        PermitsModule,
        ListbookModule,
        BlacklistModule,
        CallbackModule,
        AppsModule,
        IvrModule,
        QueueModule,
        GroupsModule,
        PromptModule,
        MohModule,
        TimegroupModule,
    ],

})

export class AppModule {}