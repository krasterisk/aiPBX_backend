import {forwardRef, Module} from '@nestjs/common';
import { VpbxUsersService } from './vpbx_users.service';
import { VpbxUsersController } from './vpbx_users.controller';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {VpbxUser} from "./vpbx_users.model";
import {UsersModule} from "../users/users.module";

@Module({
  providers: [VpbxUsersService],
  controllers: [VpbxUsersController],
  imports: [
    SequelizeModule.forFeature([VpbxUser]),
    UsersModule,
    forwardRef(() => AuthModule)
  ],
  exports: [
    VpbxUsersService
  ]
})
export class VpbxUsersModule {}
