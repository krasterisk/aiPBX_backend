import { forwardRef, Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from "./users.model";
import { UserLimits } from "./user-limits.model";
import { BalanceThresholdAlert } from "./balance-threshold-alert.model";
import { BalanceThresholdAlertsService } from "./balance-threshold-alerts.service";
import { SequelizeModule } from "@nestjs/sequelize";
import { Organization } from "../organizations/organizations.model";
import { BillingRecord } from "../billing/billing-record.model";
import { AccountingModule } from "../accounting/accounting.module";
import { RolesModule } from "../roles/roles.module";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { Rates } from "../currency/rates.model";
import { PricesModule } from "../prices/prices.module";
import { MailerModule } from "../mailer/mailer.module";
import { Payments } from "../payments/payments.model";
import { LoggerModule } from "../logger/logger.module";
import { BalanceLedger } from "../accounting/balance-ledger.model";
import { CurrencyModule } from "../currency/currency.module";
import { OurOrganizationsModule } from "../our-organizations/our-organizations.module";

@Module({
    controllers: [UsersController],
    providers: [UsersService, BalanceThresholdAlertsService],
    imports: [
        SequelizeModule.forFeature([
            User,
            Rates,
            UserLimits,
            Payments,
            BalanceLedger,
            BalanceThresholdAlert,
            Organization,
            BillingRecord,
        ]),
        RolesModule,
        forwardRef(() => AuthModule),
        forwardRef(() => AccountingModule),
        FilesModule,
        PricesModule,
        MailerModule,
        LoggerModule,
        CurrencyModule,
        OurOrganizationsModule,
    ],
    exports: [
        UsersService,
        BalanceThresholdAlertsService,
    ]
})

export class UsersModule {
}
