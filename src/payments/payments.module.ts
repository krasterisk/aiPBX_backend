import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { Payments } from "./payments.model";
import { UsersModule } from "../users/users.module";
import { TelegramModule } from "../telegram/telegram.module";

@Module({
    providers: [PaymentsService],
    controllers: [PaymentsController],
    imports: [
        SequelizeModule.forFeature([Payments]),
        forwardRef(() => AuthModule),
        UsersModule,
        ConfigModule,
        TelegramModule
    ],
    exports: [PaymentsService]
})
export class PaymentsModule { }
