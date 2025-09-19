import {HttpException, HttpStatus, Injectable, Logger, UnauthorizedException} from '@nestjs/common';
import {CreateUserDto} from "../users/dto/create-user.dto";
import {UsersService} from "../users/users.service";
import {JwtService} from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs'
import {User} from "../users/users.model";
import {MailerService} from "../mailer/mailer.service";
import {v4 as uuidv4} from 'uuid';
import {CreateRoleDto} from "../roles/dto/create-role.dto";
import {ResetPasswordDto} from "../users/dto/resetPassword.dto";
import {OAuth2Client} from 'google-auth-library';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {

    private readonly logger = new Logger(AuthService.name);
    private googleClient: OAuth2Client;

    constructor(private userService: UsersService,
                private jwtService: JwtService,
                private mailerService: MailerService) {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }

    async login(userDto: CreateUserDto) {
        const user = await this.validateUser(userDto)
        if (!user) {
            this.logger.warn("Password Compare Error")
            throw new UnauthorizedException({message: "Authorization Error"});
        }
        const token = await this.generateToken(user)
        return {token}
    }

    async signup(userDto: CreateUserDto) {
        const candidateEmail = await this.userService.getCandidateByEmail(userDto.email)

        if (candidateEmail) {
            this.logger.warn("Email already exist!", candidateEmail.email)
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

        if (user) {
            await this.mailerService.sendActivationMail(userDto.email, activationLink)
            return {success: true}
        } else {
            return {success: false}
        }

        // return this.generateToken(user)
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
            this.logger.warn('Create user error!', e)
            throw new HttpException('Create user error!', HttpStatus.BAD_REQUEST)
        }
    }

    private async generateToken(user: User) {
        const payload = {
            name: user?.name,
            email: user.email,
            id: user.id,
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
        try {
            const email = userDto.email.trim()
            const user = await this.userService.getUserByEmail(email)
            if (user) {
                const passwordEquals = await bcrypt.compare(userDto.password, user.password)
                if (user && passwordEquals) {
                    return user
                }
            }
        } catch (e) {
            this.logger.warn("Password Compare Error", e)
            throw new UnauthorizedException({message: "Authorization Error"});

        }
    }

    async forgotPassword(forgotPasswordDto: ResetPasswordDto) {
        try {
            const user = await this.userService.getUserByEmail(forgotPasswordDto.email)

            if (!user) {
                this.logger.warn('User not found')
                throw new UnauthorizedException('User not found')
            }

            const resetPasswordLink = uuidv4()

            user.resetPasswordLink = resetPasswordLink
            await user.save()

            await this.mailerService.sendResetPasswordMail(user.email, resetPasswordLink)

            return {message: 'Reset password link sent'}
        } catch (e) {
            this.logger.warn('Reset password error!', e)
            throw new HttpException('Reset password error!', HttpStatus.BAD_REQUEST)
        }
    }

    async loginWithGoogle(idToken: string) {
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();

            if (!payload) {
                this.logger.warn('Invalid Google token')
                throw new UnauthorizedException('Invalid Google token');
            }

            const {sub: googleId, email, name, picture, email_verified} = payload;

            if (!email_verified) {
                throw new UnauthorizedException('Google email not verified');
            }

            // Ищем юзера в базе
            const user = await this.userService.getUserByEmail(email);

            if (!user) {
                this.logger.warn('Google email not verified')
                throw new UnauthorizedException('Google email not verified');
            }

            // Генерируем JWT
            const token = this.jwtService.sign({
                id: user.id,
                name: user?.name,
                email: user.email,
                roles: user.roles,
                vpbx_user_id: user.vpbx_user_id,
            });

            this.logger.log('User successfully auth via google', user.email)
            return {token, user};
        } catch (e) {
            this.logger.warn('Google Authorization Error', e)
            throw new UnauthorizedException('Google Authorization Error');
        }
    }

    async signupWithGoogle(idToken: string) {
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();

            if (!payload) {
                this.logger.warn('Invalid Google token')
                throw new UnauthorizedException('Invalid Google token');
            }

            const {sub: googleId, email, name, picture, email_verified} = payload;

            if (!email_verified) {
                throw new UnauthorizedException('Google email not verified');
            }

            // Ищем юзера в базе
            const candidateUser = await this.userService.getUserByEmail(email);
            if (candidateUser) {
                this.logger.warn('Google email already exist')
                throw new UnauthorizedException('Email already exist');
            }

            // создаём
            const user = await this.userService.create({
                email,
                name,
                password: null, // пароль не нужен
                roles: [{ value: 'USER', description: 'Customer' }],
                googleId,       // добавь поле googleId в модель
                avatar: picture,
                });

            // Генерируем JWT
            const token = this.jwtService.sign({
                id: user.id,
                name: user?.name,
                email: user.email,
                roles: user.roles
            });

            this.logger.log('User successfully signup via google', user.email)
            return {token, user};
        } catch (e) {
            this.logger.warn('Google Authorization Error', e)
            throw new UnauthorizedException('Google Authorization Error');
        }
    }

    async signupWithTelegram(data: any) {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        // Проверяем подпись
        const checkHash = data.hash;
        const dataCheckString = Object.keys(data)
            .filter((key) => key !== 'hash')
            .sort()
            .map((key) => `${key}=${data[key]}`)
            .join('\n');

        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
        const hmac = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (hmac !== checkHash) {
            this.logger.warn('Telegram Authorization Error')
            throw new UnauthorizedException('Invalid Telegram data');
        }

        // Ищем пользователя по telegram_id
        const candidateUser = await this.userService.getUserByTelegramId(data.id);

        if (candidateUser) {
            this.logger.warn('Google email already exist')
            throw new UnauthorizedException('Email already exist');
        }
         // Создаём нового
        const user = await this.userService.create({
            email: `${data.id}@telegram.fake`, // можно завести фейковый email
            name: data.username || `tg_${data.id}`,
            telegramId: data.id,
            password: null, // у телеграм-пользователя нет пароля
            roles: [{ value: 'USER', description: 'Customer' }],
        });

        // Генерим JWT
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            telegramId: user.telegramId,
            roles: user.roles,
        };

        const token = this.jwtService.sign(payload)
        this.logger.log('User successfully signup via telegram', user.email)
        return { token };
    }

    async loginWithTelegram(data: any) {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        // Проверяем подпись
        const checkHash = data.hash;
        const dataCheckString = Object.keys(data)
            .filter((key) => key !== 'hash')
            .sort()
            .map((key) => `${key}=${data[key]}`)
            .join('\n');

        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
        const hmac = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (hmac !== checkHash) {
            this.logger.warn('Telegram Signup Error')
            throw new UnauthorizedException('Invalid Telegram data');
        }

        // Ищем пользователя по telegram_id
        const user = await this.userService.getUserByTelegramId(data.id);

        if (!user) {
            this.logger.warn('TelegramId not exist!', data.id)
            throw new UnauthorizedException('User not exist');
        }

        // Генерим JWT
        const payload = {
            id: user.id,
            email: user.email,
            name: user.name,
            telegramId: user.telegramId,
            roles: user.roles,
        };

        const token = this.jwtService.sign(payload)

        return { token };
    }

}

