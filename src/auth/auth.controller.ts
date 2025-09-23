import {
    Body,
    Controller, HttpException, HttpStatus, Patch,
    Post,
} from '@nestjs/common';
import {ApiOperation, ApiTags} from "@nestjs/swagger";
import {CreateUserDto} from "../users/dto/create-user.dto";
import {AuthService} from "./auth.service";
import {TelegramAuthDto} from "./dto/telegram.auth.dto";
import {ActivationDto} from "../users/dto/activation.dto";

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
    async telegramLogin(@Body() telegramDto: TelegramAuthDto) {
        return this.authService.loginWithTelegram(telegramDto);
    }

    @Post('/telegram/signup')
    async telegramSignup(@Body() telegramDto: TelegramAuthDto) {
        return this.authService.signupWithTelegram(telegramDto);
    }

    @Post('/telegram/check')
    async telegramCheckHash(@Body() telegramDto: TelegramAuthDto) {
        return this.authService.checkHash(telegramDto);
    }

    @ApiOperation({summary: "activation user"})
    @Post('activation')
    async activate(@Body() dto: ActivationDto) {
        const user = await this.authService.activate(dto)
        if(user) {
            return this.authService.login(dto)
        }
    }
}
