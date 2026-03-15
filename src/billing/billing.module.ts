import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingRecord } from './billing-record.model';
import { AiCdr } from '../ai-cdr/ai-cdr.model';
import { Prices } from '../prices/prices.model';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        SequelizeModule.forFeature([BillingRecord, AiCdr, Prices]),
        UsersModule,
        forwardRef(() => AuthModule),
    ],
    controllers: [BillingController],
    providers: [BillingService],
    exports: [BillingService],
})
export class BillingModule { }

