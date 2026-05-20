import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from "../users/users.module";
import { JwtModule } from "@nestjs/jwt";
import { TelegramService } from "../telegram/telegram.service";
import { LoggerModule } from "../logger/logger.module";
import { MailerModule } from "../mailer/mailer.module";
import { LegalAcceptance } from "../legal/legal-acceptance.model";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";

@Module({
    controllers: [AuthController],
    providers: [AuthService, TelegramService, LegalAcceptanceService],
    imports: [
        forwardRef(() => UsersModule),
        SequelizeModule.forFeature([LegalAcceptance]),
        JwtModule.register({
            secret: process.env.PRIVATE_KEY || 'SECRET',
            signOptions: {
                expiresIn: '14d'
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
