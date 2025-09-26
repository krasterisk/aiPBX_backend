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
import {TelegramAuthDto} from "./dto/telegram.auth.dto";
import {ActivationDto} from "../users/dto/activation.dto";

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
        const candidate = await this.userService.getCandidateByEmail(userDto.email)

        if (!candidate) {
            this.logger.warn("Email not found!", candidate.email)
            throw new HttpException('Email not found!', HttpStatus.BAD_REQUEST)
        }

        const activationCode = ("" + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
        const activationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        candidate.activationExpires = activationExpires
        candidate.activationCode = activationCode

        await candidate.save()

        const result = await this.mailerService.sendActivationMail(userDto.email, activationCode)

        if(result.success) {
            return { success: true }
        }

        this.logger.warn("Email not send!", result)
        throw new HttpException('Error while sending activation code', HttpStatus.BAD_REQUEST)

    }

    async signup(userDto: CreateUserDto) {

        const candidate = await this.userService.getCandidateByEmail(userDto.email)

        if (candidate && candidate.isActivated) {
            this.logger.warn("Email already exist!", candidate.email)
            throw new HttpException('Email already exist!', HttpStatus.BAD_REQUEST)
        }

        const activationCode = ("" + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
        const activationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        const roles: CreateRoleDto[] = [
            {
                value: 'USER',
                description: 'CUSTOMER'
            }
        ]

        await this.mailerService.sendActivationMail(userDto.email, activationCode)

        if(!candidate) {
            const user = await this.userService.create({
                ...userDto,
                roles,
                activationCode,
                activationExpires
            })

            if (user) {
                return {success: true}
            }
        }

        if(!candidate.isActivated) {
            candidate.activationCode = activationCode
            candidate.activationExpires = activationExpires
            await candidate.save()
            return { success: true }
        }

        this.logger.warn("Signup error!", candidate.email)
        throw new HttpException('Signup error!', HttpStatus.BAD_REQUEST)

        // return this.generateToken(user)
    }

    async activate(activation: ActivationDto) {
            if(!activation.activationCode) {
                this.logger.warn("Activation error: no code", activation)
                throw new HttpException('Activation error!', HttpStatus.BAD_REQUEST)
            }

            if(!activation.email) {
                this.logger.warn("Activation user not found by email", activation)
                throw new HttpException('Activation error!', HttpStatus.BAD_REQUEST)
            }

            const candidate = await this.userService.getCandidateByEmail(activation.email);

            if (!candidate) {
                this.logger.warn("Activation user not found", activation)
                throw new HttpException('User not found', HttpStatus.NOT_FOUND);
            }

            if (!candidate.activationCode) {
                this.logger.warn("Activation code is empty", candidate.activationCode)
                throw new HttpException('Activation code error', HttpStatus.BAD_REQUEST);
            }

            if (!candidate.activationExpires) {
                this.logger.warn("Activation time expired",
                    String(candidate.activationExpires)
                )
                throw new HttpException('Activation error', HttpStatus.BAD_REQUEST);
            }

            if (candidate.activationExpires < Date.now()) {
                                this.logger.warn("Activation code expires")
                throw new HttpException('Activation code expired', HttpStatus.BAD_REQUEST);
            }

            if (candidate.activationCode !== activation.activationCode) {
                this.logger.warn("Invalid activation code")
                throw new HttpException('Invalid activation code', HttpStatus.BAD_REQUEST);
            }

            candidate.isActivated = true;
            candidate.activationCode = null;
            candidate.activationExpires = null;
            candidate.authType = 'email';
            await candidate.save();

            const token = await this.generateToken(candidate)

            if(token) {
                return { token, user: candidate };
            }

            this.logger.warn("Generate token error")
            throw new HttpException('Authorization error', HttpStatus.BAD_REQUEST);


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
            if(!userDto.email) {
                this.logger.warn("Email is empty")
                throw new UnauthorizedException({message: "Authorization Error"});
            }
            const email = userDto.email.trim()
            const user = await this.userService.getUserByEmail(email)
            if (user) {
                const passwordEquals = await bcrypt.compare(userDto.password, user.password)
                if (user && passwordEquals) {
                    const userPlain = user.get({ plain: true })
                    const {
                        password,
                        resetPasswordLink,
                        activationCode,
                        isActivated,
                        telegramId,
                        googleId,
                        ...safeUser } = userPlain
                    return safeUser as User
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
            const user = await this.userService.getCandidateByEmail(email);

            if (!user) {
                this.logger.warn('Google email not verified')
                throw new UnauthorizedException('Google email not verified');
            }
            user.googleId = googleId;
            user.name = name;
            user.avatar = picture;
            authType: 'google',
            await user.save()

            // Генерируем JWT
            const token = await this.generateToken(user)

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
            const candidateUser = await this.userService.getCandidateByEmail(email);
            if (candidateUser) {
                this.logger.warn('Google email already exist')
                throw new UnauthorizedException('Email already exist');
            }

            // создаём
            const user = await this.userService.create({
                email,
                name,
                isActivated: true,
                roles: [{ value: 'USER', description: 'Customer' }],
                googleId,
                authType: 'google',
                avatar: picture,
                });

            // Генерируем JWT
            const token = await this.generateToken(user)

            this.logger.log('User successfully signup via google', user.email)
            return {token, user};
        } catch (e) {
            this.logger.warn('Google Authorization Error', e)
            throw new UnauthorizedException('Google Authorization Error');
        }
    }

    async checkHash(data: any) {
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

        return { botToken: BOT_TOKEN, hmac, checkHash }
    }

    async signupWithTelegram(data: TelegramAuthDto) {
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
        const candidateUser = await this.userService.getCandidateByTelegramId(data.id);

        if (candidateUser) {
            this.logger.warn('User already exist')
            throw new UnauthorizedException('User already exist');
        }
         // Создаём нового
        const roles = [{ value: 'USER', description: 'CUSTOMER' }];

        const user = await this.userService.create({
            email: null, // можно завести фейковый email
            name: data.first_name || `tg_${data.id}`,
            telegramId: data.id,
            isActivated: true,
            authType: 'telegram',
            avatar: data.photo_url,
            roles
        });

        // Генерим JWT
        const token = await this.generateToken(user)

        this.logger.log('User successfully signup via telegram', user.email)
        return { token, user };
    }

    async loginWithTelegram(data: TelegramAuthDto) {
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
        const user = await this.userService.getCandidateByTelegramId(data.id);

        if (!user) {
            this.logger.warn('TelegramId not exist!', data.id)
            throw new UnauthorizedException('User not exist');
        }

        user.authType = 'telegram';
        user.telegramId = data.id;
        user.name = `${data.first_name} ${data.last_name}`.trim();
        if(data.photo_url !== user.avatar) {
            user.avatar = data.photo_url
        }
        await user.save()
        // Генерим JWT
        const token = await this.generateToken(user)

        return { token, user };
    }

}

