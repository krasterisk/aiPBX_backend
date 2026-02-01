import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import { WidgetWebRTCService } from './widget-webrtc.service';
import { WidgetSession } from './widget-sessions.model';
import { WidgetKeysModule } from '../widget-keys/widget-keys.module';
import { OpenAiModule } from '../open-ai/open-ai.module';
import { AiCdrModule } from '../ai-cdr/ai-cdr.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
    imports: [
        SequelizeModule.forFeature([WidgetSession]),
        WidgetKeysModule,
        OpenAiModule,
        AiCdrModule,
        TelegramModule,
    ],
    controllers: [WidgetController],
    providers: [WidgetService, WidgetWebRTCService],
    exports: [WidgetService, WidgetWebRTCService],
})
export class WidgetModule { }
