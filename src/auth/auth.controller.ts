import {
    Body,
    Controller,
    Post,
    Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { AuthService, AuthRequestContext } from "./auth.service";
import { TelegramAuthDto } from "./dto/telegram.auth.dto";
import { ActivationDto } from "../users/dto/activation.dto";

function buildAuthContext(req: Request): AuthRequestContext {
    const xff = (req.headers['x-forwarded-for'] as string | undefined) || '';
    const first = xff.split(',')[0]?.trim();
    return {
        ip: first || (req.socket?.remoteAddress ?? null),
        userAgent: (req.headers['user-agent'] as string | undefined) || null,
    };
}

@ApiTags('Authorization')
@Controller('auth')
export class AuthController {

    constructor(private authService: AuthService) {
    }

    @Post('/login')
    async login(@Body() userDto: CreateUserDto, @Req() req: Request) {
        return this.authService.login(userDto, buildAuthContext(req))
    }

    @Post('/signup')
    signup(@Body() userDto: CreateUserDto, @Req() req: Request) {
        return this.authService.signup(userDto, buildAuthContext(req))
    }

    @Post('/google/login')
    async googleLogin(@Body('id_token') idToken: string, @Body('legalAcceptance') legalAcceptance: never[] | undefined, @Req() req: Request) {
        return this.authService.loginWithGoogle(idToken, legalAcceptance as never, buildAuthContext(req));
    }

    @Post('/google/signup')
    async googleSignup(@Body('id_token') idToken: string, @Body('legalAcceptance') legalAcceptance: never[] | undefined, @Req() req: Request) {
        return this.authService.signupWithGoogle(idToken, legalAcceptance as never, buildAuthContext(req));
    }

    @Post('/telegram/login')
    async telegramLogin(@Body() telegramDto: TelegramAuthDto, @Req() req: Request) {
        return this.authService.loginWithTelegram(telegramDto, buildAuthContext(req));
    }

    @Post('/telegram/signup')
    async telegramSignup(@Body() telegramDto: TelegramAuthDto, @Req() req: Request) {
        return this.authService.signupWithTelegram(telegramDto, buildAuthContext(req));
    }

    @ApiOperation({ summary: "activation user" })
    @Post('activation')
    async activate(@Body() dto: ActivationDto, @Req() req: Request) {
        return await this.authService.activate(dto, buildAuthContext(req))
    }
}
