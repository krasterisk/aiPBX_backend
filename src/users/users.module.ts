import { forwardRef, Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from "./users.model";
import { UserLimits } from "./user-limits.model";
import { SequelizeModule } from "@nestjs/sequelize";
import { RolesModule } from "../roles/roles.module";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { Rates } from "../currency/rates.model";
import { PricesModule } from "../prices/prices.module";
import { MailerModule } from "../mailer/mailer.module";
import { Payments } from "../payments/payments.model";
import { LoggerModule } from "../logger/logger.module";

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    imports: [
        SequelizeModule.forFeature([User, Rates, UserLimits, Payments]),
        RolesModule,
        forwardRef(() => AuthModule),
        FilesModule,
        PricesModule,
        MailerModule,
        LoggerModule,
    ],
    exports: [
        UsersService
    ]
})

export class UsersModule {
}
