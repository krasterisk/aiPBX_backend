import {forwardRef, Module} from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {UsersModule} from "../users/users.module";
import {JwtModule} from "@nestjs/jwt";
import {MailerService} from "../mailer/mailer.service";
import {TelegramService} from "../telegram/telegram.service";
import {LogsModule} from "../logs/logs.module";

@Module({
  controllers: [AuthController],
  providers: [AuthService, MailerService, TelegramService],
  imports: [
      forwardRef(() => UsersModule),
      JwtModule.register({
          secret: process.env.PRIVATE_KEY || 'SECRET',
          signOptions: {
              expiresIn: '180d'
          }
      }),
      LogsModule
  ],
    exports: [
        AuthService,
        JwtModule,
    ]
})
export class AuthModule {}
