import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {PaymentsService} from "./payments.service";
import {PaymentsController} from "./payments.controller";
import {Payments} from "./payments.model";
import {UsersModule} from "../users/users.module";

@Module({
    providers: [PaymentsService],
    controllers: [PaymentsController],
    imports: [
        SequelizeModule.forFeature([Payments]),
        forwardRef(() => AuthModule),
        UsersModule,
    ],
    exports: [PaymentsService]
})
export class PaymentsModule {}
