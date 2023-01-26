import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {PermitsService} from "./permits.service";
import {PermitsController} from "./permits.controller";
import {Permit} from "./permit.model";

@Module({
    providers: [PermitsService],
    controllers: [PermitsController],
    imports: [
        SequelizeModule.forFeature([Permit]),
        forwardRef(() => AuthModule)
    ],
})

export class PermitsModule {}

