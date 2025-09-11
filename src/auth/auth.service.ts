import {HttpException, HttpStatus, Injectable, UnauthorizedException} from '@nestjs/common';
import {CreateUserDto} from "../users/dto/create-user.dto";
import {UsersService} from "../users/users.service";
import {JwtService} from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs'
import {User} from "../users/users.model";
import { MailerService } from "../mailer/mailer.service";
import { v4 as uuidv4 } from 'uuid';
import { CreateRoleDto } from "../roles/dto/create-role.dto";
import { ResetPasswordDto } from "../users/dto/resetPassword.dto";

@Injectable()
export class AuthService {

    constructor(private userService: UsersService,
                private jwtService: JwtService,
                private mailerService: MailerService) {
    }

    async login(userDto: CreateUserDto) {
        const user = await this.validateUser(userDto)
        return this.generateToken(user)
    }

    async registration(userDto: CreateUserDto) {
        try {
            const candidateEmail = await this.userService.getUserByEmail(userDto.email)
            if (candidateEmail) {
                throw new HttpException('Email already exist!', HttpStatus.BAD_REQUEST)
            }

            const activationLink = uuidv4()
            const roles: CreateRoleDto[] = [
                {
                    value: 'USER',
                    description: 'Customer'
                }
            ]
            const hashPassword = await bcrypt.hash(userDto.password, 5)

            const user = await this.userService.create({...userDto, password: hashPassword, roles, activationLink})

            if(user) {
                await this.mailerService.sendActivationMail(userDto.email, activationLink)
                return { success: true }
            } else {
                return { success: false }
            }

            // return this.generateToken(user)


        } catch (e) {
            throw new HttpException('[user] Create user error!' + e, HttpStatus.BAD_REQUEST)
        }
    }

    async create(userDto: CreateUserDto) {
        try {
            const candidate = await this.userService.getUserByUsername(userDto.username)
            if (candidate) {
                throw new HttpException('Username already exist!', HttpStatus.BAD_REQUEST)
            }

            const hashPassword = await bcrypt.hash(userDto.password, 5)
            const user = await this.userService.create({...userDto, password: hashPassword})
            return user
        } catch (e) {
            throw new HttpException('[user] Create user error!' + e, HttpStatus.BAD_REQUEST)
        }
    }

    private async generateToken(user: User) {
        const payload = {
            username: user.username,
            email: user.email,
            id: user.id,
            avatar: user.avatar,
            roles: user.roles,
            vpbx_user_id: user.vpbx_user_id,
        }
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

    async forgotPassword(forgotPasswordDto: ResetPasswordDto) {
        try {
            const user = await this.userService.getUserByEmail(forgotPasswordDto.email)

            if (!user) {
                throw new HttpException('User not found', HttpStatus.NOT_FOUND)
            }

            const resetPasswordLink = uuidv4()

            user.resetPasswordLink = resetPasswordLink
            await user.save()

            await this.mailerService.sendResetPasswordMail(user.email, resetPasswordLink)

            return { message: 'Reset password link sent' }
        } catch (e) {
            throw new HttpException('[auth] Reset password error!' + e, HttpStatus.BAD_REQUEST)
        }
    }


}
