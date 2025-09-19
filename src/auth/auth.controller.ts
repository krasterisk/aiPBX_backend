import {
    Body,
    Controller,
    Post,
} from '@nestjs/common';
import {ApiTags} from "@nestjs/swagger";
import {CreateUserDto} from "../users/dto/create-user.dto";
import {AuthService} from "./auth.service";
import {TelegramAuthDto} from "./dto/telegram.auth.dto";

@ApiTags('Authorization')
@Controller('auth')
export class AuthController {


    constructor(private authService: AuthService) {}

    @Post('/login')
    async login(@Body() userDto: CreateUserDto) {
        return this.authService.login(userDto)
    }

    @Post('/signup')
    signup(@Body() userDto: CreateUserDto) {
        return this.authService.signup(userDto)
    }

    @Post('/google/login')
    async googleLogin(@Body('id_token') idToken: string) {
        return this.authService.loginWithGoogle(idToken);
    }

    @Post('/google/signup')
    async googleSignup(@Body('id_token') idToken: string) {
        return this.authService.signupWithGoogle(idToken);
    }

    @Post('/telegram/login')
    async telegramLogin(@Body('id_token') idToken: string) {
        return this.authService.loginWithTelegram(idToken);
    }

    @Post('/telegram/signup')
    async telegramSignup(@Body() telegramDto: TelegramAuthDto) {
        console.log(telegramDto)
        return this.authService.signupWithTelegram(telegramDto);
    }
}
