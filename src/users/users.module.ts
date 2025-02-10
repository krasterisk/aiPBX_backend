import {forwardRef, Module} from '@nestjs/common';
import {UsersController} from './users.controller';
import {UsersService} from './users.service';
import {User} from "./users.model";
import {SequelizeModule} from "@nestjs/sequelize";
import {RolesModule} from "../roles/roles.module";
import {AuthModule} from "../auth/auth.module";

@Module({
    controllers: [UsersController],
    providers: [UsersService],
    imports: [
        SequelizeModule.forFeature([User]),
        RolesModule,
        forwardRef(() => AuthModule)
    ],
    exports: [
        UsersService
    ]
})

export class UsersModule {
}
