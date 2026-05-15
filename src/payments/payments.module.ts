import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { Payments } from "./payments.model";
import { UsersModule } from "../users/users.module";
import { TelegramModule } from "../telegram/telegram.module";
import { CurrencyModule } from "../currency/currency.module";
import { LoggerModule } from "../logger/logger.module";
import { AccountingModule } from "../accounting/accounting.module";
import { CurrencyHistory } from "../accounting/currency-history.model";
import { BalanceLedger } from "../accounting/balance-ledger.model";

@Module({
    providers: [PaymentsService],
    controllers: [PaymentsController],
    imports: [
        SequelizeModule.forFeature([Payments, CurrencyHistory, BalanceLedger]),
        forwardRef(() => AuthModule),
        UsersModule,
        AccountingModule,
        ConfigModule,
        TelegramModule,
        CurrencyModule,
        LoggerModule
    ],
    exports: [PaymentsService]
})
export class PaymentsModule { }
