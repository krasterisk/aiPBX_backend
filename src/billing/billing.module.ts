import { forwardRef, Module } from '@nestjs/common';

import { SequelizeModule } from '@nestjs/sequelize';

import { BillingService } from './billing.service';

import { BillingController } from './billing.controller';

import { BillingRecord } from './billing-record.model';

import { AiCdr } from '../ai-cdr/ai-cdr.model';

import { Prices } from '../prices/prices.model';

import { Rates } from '../currency/rates.model';

import { UsersModule } from '../users/users.module';

import { AuthModule } from '../auth/auth.module';

import { LoggerModule } from '../logger/logger.module';

import { CurrencyModule } from '../currency/currency.module';

import { BillingFxService } from './billing-fx.service';

import { BalanceRunwayNotification } from './balance-runway-notification.model';

import { BalanceThresholdAlert } from '../users/balance-threshold-alert.model';

import { Organization } from '../organizations/organizations.model';

import { User } from '../users/users.model';

import { MailerModule } from '../mailer/mailer.module';

import { AccountingModule } from '../accounting/accounting.module';

import { BillingRunwayService } from './billing-runway.service';

import { BillingRunwayTask } from './billing-runway.task';



@Module({

    imports: [

        SequelizeModule.forFeature([

            BillingRecord,

            AiCdr,

            Prices,

            Rates,

            BalanceRunwayNotification,

            BalanceThresholdAlert,

            Organization,

            User,

        ]),

        CurrencyModule,

        MailerModule,

        forwardRef(() => AccountingModule),

        forwardRef(() => UsersModule),

        forwardRef(() => AuthModule),

        LoggerModule,

    ],

    controllers: [BillingController],

    providers: [BillingService, BillingFxService, BillingRunwayService, BillingRunwayTask],

    exports: [BillingService, BillingFxService, BillingRunwayService],

})

export class BillingModule { }


