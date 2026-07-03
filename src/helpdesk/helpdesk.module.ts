import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { MailerModule } from '../mailer/mailer.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ApiKeyModule } from '../api-keys/api-key.module';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';
import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';
import { HelpdeskTicketStatusHistory } from './models/helpdesk-ticket-status-history.model';
import { HelpdeskClientContext } from './models/helpdesk-client-context.model';
import { HelpdeskPbxConnection } from './models/helpdesk-pbx-connection.model';
import { HelpdeskSettings } from './models/helpdesk-settings.model';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';
import { HelpdeskLlmContextService } from './helpdesk-llm-context.service';
import { HelpdeskNotificationService } from './helpdesk-notification.service';
import { HelpdeskPbxAgentService } from './helpdesk-pbx-agent.service';
import { HelpdeskToolsService } from './helpdesk-tools.service';
import { HelpdeskController } from './helpdesk.controller';
import { HelpdeskToolsController } from './helpdesk-tools.controller';

@Module({
    imports: [
        SequelizeModule.forFeature([
            HelpdeskTicket,
            HelpdeskTicketMessage,
            HelpdeskTicketStatusHistory,
            HelpdeskClientContext,
            HelpdeskPbxConnection,
            HelpdeskSettings,
        ]),
        AccountingModule,
        MailerModule,
        TelegramModule,
        ApiKeyModule,
        HttpModule,
        forwardRef(() => AuthModule),
    ],
    controllers: [HelpdeskController, HelpdeskToolsController],
    providers: [
        HelpdeskService,
        HelpdeskAlfawebhookService,
        HelpdeskLlmContextService,
        HelpdeskNotificationService,
        HelpdeskPbxAgentService,
        HelpdeskToolsService,
    ],
    exports: [
        HelpdeskService,
        HelpdeskAlfawebhookService,
        HelpdeskLlmContextService,
        HelpdeskToolsService,
        SequelizeModule,
    ],
})
export class HelpdeskModule {}
