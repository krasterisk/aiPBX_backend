import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { UsersModule } from './users/users.module';
import { ConfigModule } from "@nestjs/config";
import { RolesModule } from './roles/roles.module';
import { AuthModule } from './auth/auth.module';
import { FilesModule } from './files/files.module';
import { ServeStaticModule } from "@nestjs/serve-static";
import * as path from 'path';
import { getMysqlConfig } from "./config/mysql.config";
import { AriModule } from "./ari/ari.module";
import { AssistantsModule } from "./assistants/assistants.module";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { AiModelsModule } from './ai-models/ai-models.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AiToolsHandlersModule } from './ai-tools-handlers/ai-tools-handlers.module';
import { HttpModule } from "@nestjs/axios";
import { PaymentsModule } from './payments/payments.module';
import { PricesModule } from './prices/prices.module';
import { TelegramModule } from './telegram/telegram.module';
import { ScheduleModule } from "@nestjs/schedule";
import { CurrencyModule } from "./currency/currency.module";
import { PbxServersModule } from './pbx-servers/pbx-servers.module';
import { PlaygroundModule } from "./playground/playground.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { WidgetKeysModule } from './widget-keys/widget-keys.module';
import { WidgetModule } from './widget/widget.module';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        ConfigModule.forRoot({
            envFilePath: `.${process.env.NODE_ENV}.env`
        }),
        ServeStaticModule.forRoot({
            rootPath: path.resolve(process.cwd(), 'static'),
            serveRoot: '/static',
        }),
        SequelizeModule.forRootAsync({
            useFactory: getMysqlConfig
        }),
        EventEmitterModule.forRoot(),
        UsersModule,
        RolesModule,
        AuthModule,
        FilesModule,
        //        AmiModule,
        AriModule,
        AssistantsModule,
        AiModelsModule,
        AiToolsModule,
        AiToolsHandlersModule,
        //        VoskServerModule,
        HttpModule.register({
            timeout: 5000,
            maxRedirects: 5
        }),
        PaymentsModule,
        PricesModule,
        TelegramModule,
        CurrencyModule,
        PbxServersModule,
        PlaygroundModule,
        OrganizationsModule,
        WidgetKeysModule,
        WidgetModule
    ]
})

export class AppModule { }
