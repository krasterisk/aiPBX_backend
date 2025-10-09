import {forwardRef, Module} from '@nestjs/common';
import {UsersController} from './users.controller';
import {UsersService} from './users.service';
import {User} from "./users.model";
import {SequelizeModule} from "@nestjs/sequelize";
import {RolesModule} from "../roles/roles.module";
import {AuthModule} from "../auth/auth.module";
import {FilesModule} from "../files/files.module";
import {Rates} from "../currency/rates.model";
import {PricesModule} from "../prices/prices.module";

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    imports: [
        SequelizeModule.forFeature([User, Rates]),
        RolesModule,
        forwardRef(() => AuthModule),
        FilesModule,
        PricesModule
    ],
    exports: [
        UsersService
    ]
})

export class UsersModule {
}
