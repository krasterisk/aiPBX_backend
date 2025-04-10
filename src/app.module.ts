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
import { AiModelsService } from './ai-models/ai-models.service';
import { AiModelsController } from './ai-models/ai-models.controller';
import { AiModelsModule } from './ai-models/ai-models.module';


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
//        VoskServerModule
    ]
})

export class AppModule {}
