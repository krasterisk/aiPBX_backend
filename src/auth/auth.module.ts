import {forwardRef, Module} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {UsersModule} from "../users/users.module";
import {JwtModule} from "@nestjs/jwt";
import {AmiModule} from "../ami/ami.module";

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  imports: [
      forwardRef(() => UsersModule),
      forwardRef(() => AmiModule),
      JwtModule.register({
          secret: process.env.PRIVATE_KEY || 'SECRET',
          signOptions: {
              expiresIn: '24h'
          }
      })
  ],
    exports: [
        AuthService,
        JwtModule
    ]
})
export class AuthModule {}
