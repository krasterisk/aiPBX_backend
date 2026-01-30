import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { WidgetKeysController } from './widget-keys.controller';
import { WidgetKeysService } from './widget-keys.service';
import { WidgetKey } from './widget-keys.model';
import { AssistantsModule } from '../assistants/assistants.module';
import { AuthModule } from '../auth/auth.module';
import { PbxServersModule } from '../pbx-servers/pbx-servers.module';

@Module({
    imports: [
        SequelizeModule.forFeature([WidgetKey]),
        AssistantsModule,
        AuthModule,
        PbxServersModule,
    ],
    controllers: [WidgetKeysController],
    providers: [WidgetKeysService],
    exports: [WidgetKeysService],
})
export class WidgetKeysModule { }
