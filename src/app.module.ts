import {Module} from "@nestjs/common";
import {SequelizeModule} from "@nestjs/sequelize";
import {UsersModule} from './users/users.module';
import {ConfigModule} from "@nestjs/config";
import {RolesModule} from './roles/roles.module';
import {AuthModule} from './auth/auth.module';
import {FilesModule} from './files/files.module';
import {ServeStaticModule} from "@nestjs/serve-static";
import * as path from 'path';
import {getMysqlConfig} from "./config/mysql.config";
import { AriModule } from "./ari/ari.module";
import {AssistantsModule} from "./assistants/assistants.module";
import {EventEmitterModule} from "@nestjs/event-emitter";
import { AiModelsModule } from './ai-models/ai-models.module';
import { AiToolsModule } from './ai-tools/ai-tools.module';
import { AiToolsHandlersModule } from './ai-tools-handlers/ai-tools-handlers.module';
import {HttpModule} from "@nestjs/axios";
import { PaymentsModule } from './payments/payments.module';
import { PricesModule } from './prices/prices.module';
import { TelegramService } from './telegram/telegram.service';
import { TelegramModule } from './telegram/telegram.module';


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
        TelegramModule
    ]
})

export class AppModule {}
