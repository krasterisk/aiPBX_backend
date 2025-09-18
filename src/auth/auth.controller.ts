import {
    Body,
    Controller,
    Post,
} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {CreateUserDto} from "../users/dto/create-user.dto";
import {AuthService} from "./auth.service";
import {UsersService} from "../users/users.service";

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

    @Post('/google')
    async googleLogin(@Body('id_token') idToken: string) {
        console.log('google');
        return this.authService.loginWithGoogle(idToken);
    }


}
