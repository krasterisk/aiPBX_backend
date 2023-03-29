import {Module} from "@nestjs/common";
import {SequelizeModule} from "@nestjs/sequelize";
import {UsersModule} from './users/users.module';
import {ConfigModule} from "@nestjs/config";
import {RolesModule} from './roles/roles.module';
import {AuthModule} from './auth/auth.module';
import {PostsModule} from './manuals/posts/posts.module';
import {FilesModule} from './files/files.module';
import {ServeStaticModule} from "@nestjs/serve-static";
import * as path from 'path';
import {EndpointsModule} from './pbx/endpoints/endpoints.module';
import {VpbxUsersModule} from './vpbx_users/vpbx_users.module';
import {ContextsModule} from './pbx/contexts/contexts.module';
import {RoutesModule} from './pbx/routes/routes.module';
import {ExtensionsModule} from './pbx/extensions/extensions.module';
import {RecordsModule} from './pbx/records/records.module';
import {PermitsModule} from './pbx/permits/permits.module';
import {ListbookModule} from './pbx/listbook/listbook.module';
import {BlacklistModule} from './pbx/blacklist/blacklist.module';
import {CallbackModule} from './pbx/callback/callback.module';
import {AppsModule} from './pbx/apps/apps.module';
import {IvrModule} from './pbx/ivr/ivr.module';
import {QueueModule} from './pbx/queue/queue.module';
import {GroupsModule} from './pbx/groups/groups.module';
import {PromptModule} from './pbx/prompt/prompt.module';
import {MohModule} from './pbx/moh/moh.module';
import {TimegroupModule} from './pbx/timegroup/timegroup.module';
import {getMysqlConfig} from "./config/mysql.config";
import {QueueMembersModule} from './pbx/queue_members/queue_members.module';
import {WebhooksModule} from './pbx/webhooks/webhooks.module';
import {BlockImageModule} from './manuals/block-image/block-image.module';
import {ParagraphModule} from "./manuals/block-text/paragraph/paragraph.module";
import {CommentsModule} from './manuals/comments/comments.module';
import {HashtagsModule} from './manuals/hashtags/hashtags.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: `.${process.env.NODE_ENV}.env`
        }),
        ServeStaticModule.forRoot({
            rootPath: path.resolve(__dirname, 'static'),
        }),
        SequelizeModule.forRootAsync({
            useFactory: getMysqlConfig
        }),
        UsersModule,
        RolesModule,
        AuthModule,
        PostsModule,
        FilesModule,
//        AmiModule,
        EndpointsModule,
        VpbxUsersModule,
        ContextsModule,
        RoutesModule,
//        AriModule,
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
        QueueMembersModule,
        WebhooksModule,
        BlockImageModule,
        ParagraphModule,
        CommentsModule,
        HashtagsModule
    ],
})

export class AppModule {}
