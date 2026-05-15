import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { HttpModule } from '@nestjs/axios';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { DocumentCounter } from './document-counter.model';
import { BalanceLedger } from './balance-ledger.model';
import { CurrencyHistory } from './currency-history.model';
import { BillingRecord } from '../billing/billing-record.model';
import { CurrencyModule } from '../currency/currency.module';
import { BillingModule } from '../billing/billing.module';
import { DocumentCounterService } from './document-counter.service';
import { InvoiceService } from './invoice.service';
import { AlfawebhookClient } from './alfawebhook-client.service';
import { SbisService } from './sbis.service';
import { OrganizationDocumentsService } from './organization-documents.service';
import { ClosingTask } from './closing.task';

@Module({
    imports: [
        HttpModule.register({ timeout: 20000, maxRedirects: 3 }),
        SequelizeModule.forFeature([
            Organization,
            OrganizationDocument,
            DocumentCounter,
            BalanceLedger,
            CurrencyHistory,
            BillingRecord,
        ]),
        CurrencyModule,
        BillingModule,
    ],
    providers: [
        DocumentCounterService,
        AlfawebhookClient,
        SbisService,
        InvoiceService,
        OrganizationDocumentsService,
        ClosingTask,
    ],
    exports: [
        InvoiceService,
        OrganizationDocumentsService,
        SbisService,
        DocumentCounterService,
        AlfawebhookClient,
    ],
})
export class AccountingModule {}
