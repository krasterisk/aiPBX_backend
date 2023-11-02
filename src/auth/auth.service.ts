import {HttpException, HttpStatus, Injectable, UnauthorizedException} from '@nestjs/common';
import {CreateUserDto} from "../users/dto/create-user.dto";
import {UsersService} from "../users/users.service";
import {JwtService} from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs'
import {User} from "../users/users.model";

@Injectable()
export class AuthService {

    constructor(private userService: UsersService,
                private jwtService: JwtService) {
    }

    async login(userDto: CreateUserDto) {
        const user = await this.validateUser(userDto)
        return this.generateToken(user)
    }

    async registration(userDto: CreateUserDto) {
        try {
            const candidate = await this.userService.getUserByUsername(userDto.username)
            if (candidate) {
                throw new HttpException('Username already exist!', HttpStatus.BAD_REQUEST)
            }

            const hashPassword = await bcrypt.hash(userDto.password, 5)
            const user = await this.userService.create({...userDto, password: hashPassword})
            return this.generateToken(user)

        } catch (e) {
            throw new HttpException('[user] Create user error!' + e, HttpStatus.BAD_REQUEST)
        }
    }

    private async generateToken(user: User) {
        const payload = {username: user.username, email: user.email, id: user.id, avatar: user.avatar, designed: user.designed, vpbx_user_id: user.vpbx_user_id, roles: user.roles}
        return this.jwtService.sign(payload)
        // return {
        //     token: this.jwtService.sign(payload),
        //     user
        // }
    }

    private async validateUser(userDto: CreateUserDto) {
        const user = await this.userService.getUserByUsername(userDto.username)
        if (!user) {
            throw new UnauthorizedException({message: 'Username or password is wrong!'})
        }
        const passwordEquals = await bcrypt.compare(userDto.password, user.password)
        if (user && passwordEquals) {
            return user
        }
        throw new UnauthorizedException({message: 'Username or password is wrong!'})
    }
}
