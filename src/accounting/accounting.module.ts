import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
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
import { OrganizationsModule } from '../organizations/organizations.module';
import { EgrulCache } from './egrul-cache.model';
import { SbisController } from './sbis.controller';
import { OurOrganization } from '../our-organizations/our-organization.model';
import { OurOrganizationsModule } from '../our-organizations/our-organizations.module';
import { User } from '../users/users.model';

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
            EgrulCache,
            OurOrganization,
            User,
        ]),
        CurrencyModule,
        forwardRef(() => BillingModule),
        OurOrganizationsModule,
        forwardRef(() => OrganizationsModule),
        forwardRef(() => AuthModule),
    ],
    controllers: [SbisController],
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
