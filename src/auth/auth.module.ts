import { forwardRef, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from "../users/users.module";
import { JwtModule } from "@nestjs/jwt";
import { TelegramService } from "../telegram/telegram.service";
import { LoggerModule } from "../logger/logger.module";
import { MailerModule } from "../mailer/mailer.module";

@Module({
    controllers: [AuthController],
    providers: [AuthService, TelegramService],
    imports: [
        forwardRef(() => UsersModule),
        JwtModule.register({
            secret: process.env.PRIVATE_KEY || 'SECRET',
            signOptions: {
                expiresIn: '180d'
            }
        }),
        LoggerModule,
        MailerModule
    ],
    exports: [
        AuthService,
        JwtModule,
    ]
})
export class AuthModule { }
