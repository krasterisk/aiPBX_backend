import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingRecord } from './billing-record.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { Prices } from '../prices/prices.model';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
    imports: [
        SequelizeModule.forFeature([BillingRecord, AiCdr, Prices]),
        UsersModule,
        forwardRef(() => AuthModule),
        LoggerModule,
    ],
    controllers: [BillingController],
    providers: [BillingService],
    exports: [BillingService],
})
export class BillingModule { }

