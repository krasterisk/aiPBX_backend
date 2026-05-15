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

@Module({
    imports: [
        SequelizeModule.forFeature([BillingRecord, AiCdr, Prices, Rates]),
        CurrencyModule,
        UsersModule,
        forwardRef(() => AuthModule),
        LoggerModule,
    ],
    controllers: [BillingController],
    providers: [BillingService, BillingFxService],
    exports: [BillingService, BillingFxService],
})
export class BillingModule { }

