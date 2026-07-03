import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthModule } from '../auth/auth.module';
import { AccountingModule } from '../accounting/accounting.module';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';
import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';
import { HelpdeskTicketStatusHistory } from './models/helpdesk-ticket-status-history.model';
import { HelpdeskClientContext } from './models/helpdesk-client-context.model';
import { HelpdeskPbxConnection } from './models/helpdesk-pbx-connection.model';
import { HelpdeskSettings } from './models/helpdesk-settings.model';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';
import { HelpdeskController } from './helpdesk.controller';

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
        forwardRef(() => AuthModule),
    ],
    controllers: [HelpdeskController],
    providers: [HelpdeskService, HelpdeskAlfawebhookService],
    exports: [HelpdeskService, HelpdeskAlfawebhookService, SequelizeModule],
})
export class HelpdeskModule {}
