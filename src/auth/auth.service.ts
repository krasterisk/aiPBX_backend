import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from "../users/dto/create-user.dto";
import { UsersService } from "../users/users.service";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from 'bcryptjs'
import { User } from "../users/users.model";
import { MailerService } from "../mailer/mailer.service";
import { CreateRoleDto } from "../roles/dto/create-role.dto";
import { OAuth2Client } from 'google-auth-library';
import * as crypto from 'crypto';
import { TelegramAuthDto } from "./dto/telegram.auth.dto";
import { ActivationDto } from "../users/dto/activation.dto";
import { TelegramService } from "../telegram/telegram.service";
import { LoggerService } from "../logger/logger.service";
import { LegalAcceptanceService } from "../legal/legal-acceptance.service";
import { LegalAcceptanceItemDto } from "../legal/dto/legal-acceptance.dto";

export interface AuthRequestContext {
    ip?: string | null;
    userAgent?: string | null;
}

@Injectable()
export class AuthService {

    private readonly logger = new Logger(AuthService.name);
    private googleClient: OAuth2Client;

    constructor(private userService: UsersService,
        private jwtService: JwtService,
        private mailerService: MailerService,
        private telegramService: TelegramService,
        private readonly logService: LoggerService,
        private readonly legalAcceptanceService: LegalAcceptanceService,
    ) {
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    }

    private async safeRecordAcceptance(
        userId: string | number | null | undefined,
        items: LegalAcceptanceItemDto[] | undefined,
        source: 'login' | 'signup' | 'activation',
        ctx?: AuthRequestContext,
    ): Promise<void> {
        if (!userId || !items?.length) return;
        try {
            await this.legalAcceptanceService.recordBatch(userId, items, {
                ip: ctx?.ip ?? null,
                userAgent: ctx?.userAgent ?? null,
                source,
            });
        } catch (e) {
            this.logger.warn(`Failed to record legal acceptance: ${(e as Error)?.message}`);
        }
    }

    async login(userDto: CreateUserDto, ctx?: AuthRequestContext) {

        if (!userDto.email) {
            this.logger.warn("Email is empty")
            throw new HttpException('Email is empty!', HttpStatus.BAD_REQUEST)
        }

        const candidate = await this.userService.getCandidateByEmail(userDto.email)

        if (!candidate) {
            this.logger.warn("Email not found!")
            throw new HttpException('Email not found!', HttpStatus.BAD_REQUEST)
        }

        // Согласие фиксируется уже на этапе login (до активации) — пользователь
        // явно отметил чекбокс на форме. Если активация не пройдёт, запись всё
        // равно зафиксирована для аудита факта volenta'ы.
        await this.safeRecordAcceptance(candidate.id, userDto.legalAcceptance, 'login', ctx)

        const activationCode = ("" + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
        const activationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        candidate.activationExpires = activationExpires
        candidate.activationCode = activationCode

        await candidate.save()

        const result = await this.mailerService.sendActivationMail(userDto.email, activationCode)

        if (result.success) {
            return { success: true }
        }

        this.logger.warn("Email not send!", result)
        throw new HttpException('Error while sending activation code', HttpStatus.BAD_REQUEST)

    }

    async signup(userDto: CreateUserDto, ctx?: AuthRequestContext) {

        if (!userDto.email) {
            this.logger.warn("Email is empty")
            throw new HttpException('Email is empty!', HttpStatus.BAD_REQUEST)
        }

        const candidate = await this.userService.getCandidateByEmail(userDto.email)

        if (candidate) {
            this.logger.warn("Email already exists!", candidate.email)
            throw new HttpException('User already exists!', HttpStatus.BAD_REQUEST)
        }

        const activationCode = ("" + Math.floor(100000 + Math.random() * 900000)).substring(0, 6);
        const activationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

        const roles: CreateRoleDto[] = [
            {
                value: 'USER',
                description: 'CUSTOMER'
            }
        ]

        const user = await this.userService.create({
            ...userDto,
            roles,
            activationCode,
            activationExpires
        })

        if (!user) {
            this.logger.warn("Signup error: user creation failed", userDto.email)
            throw new HttpException('Signup error!', HttpStatus.BAD_REQUEST)
        }

        await this.safeRecordAcceptance(user.id, userDto.legalAcceptance, 'signup', ctx)

        await this.mailerService.sendActivationMail(userDto.email, activationCode)

        return { success: true }
    }

    async activate(activation: ActivationDto, ctx?: AuthRequestContext) {
        if (!activation.activationCode) {
            this.logger.warn("Activation error: no code", activation)
            throw new HttpException('Activation error!', HttpStatus.BAD_REQUEST)
        }

        if (!activation.email) {
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
            throw new HttpException('Activation code is wrong', HttpStatus.BAD_REQUEST);
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

        if (candidate.activationCode !== activation.activationCode.trim()) {
            this.logger.warn("Invalid activation code")
            throw new HttpException('Invalid activation code', HttpStatus.BAD_REQUEST);
        }

        candidate.isActivated = true;
        candidate.activationCode = null;
        candidate.activationExpires = null;
        candidate.authType = 'email';
        await candidate.save();

        const token = await this.generateToken(candidate)

        if (token) {
            await this.authLog(candidate, activation)
            await this.safeRecordAcceptance(candidate.id, activation.legalAcceptance, 'activation', ctx)
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
            const user = await this.userService.create({ ...userDto, password: hashPassword })
            return user
        } catch (e) {
            this.logger.warn('Create user error!', e)
            throw new HttpException('Create user error!', HttpStatus.BAD_REQUEST)
        }
    }

    private async authLog(
        user: User,
        activationData: ActivationDto,
        tgEvent: boolean = true
    ) {
        if (tgEvent) {
            const JSONText = JSON.stringify(user, null, 2);
            const formattedResult =
                `<b>User ${activationData.type} via ${user.authType}</b><pre>${JSONText}</pre>`.trim();
            this.telegramService.sendMessage(
                formattedResult, {
                parse_mode: "HTML"
            }).catch(e => this.logger.error('Failed to send telegram log', e));
        }
        await this.logService.logAction(
            user.id,
            activationData.type === 'signup' ? 'create' : 'login',
            'user',
            user.id,
            `User ${activationData.type} via ${user.authType}`,
        )
    }

    private async generateToken(user: User) {
        const payload = {
            id: user.id,
            roles: user.roles,
            vpbx_user_id: user.vpbx_user_id,
        }
        return this.jwtService.sign(payload)
    }


    async loginWithGoogle(idToken: string, legalAcceptance?: LegalAcceptanceItemDto[], ctx?: AuthRequestContext) {
        try {
            const gdata = await this.checkGoogleToken(idToken)
            const { sub: googleId, email, name, picture } = gdata;

            const user = await this.userService.getCandidateByEmail(email);

            if (!user) {
                this.logger.warn('Google email not verified')
                throw new UnauthorizedException('Google email not verified');
            }
            user.googleId = googleId;
            user.name = name;
            user.avatar = picture;
            user.authType = 'google';
            await user.save()

            const token = await this.generateToken(user)

            if (token) {
                await this.authLog(user, { type: 'login' })
                await this.safeRecordAcceptance(user.id, legalAcceptance, 'login', ctx)
                this.logger.log(`User successfully login via ${user.authType}`, user.email)
                return { token, user };
            }
            this.logger.error(`Generate token error for ${user.authType} account`)
            throw new HttpException('Authorization error', HttpStatus.BAD_REQUEST);

        } catch (e) {
            this.logger.error('Google Authorization Error')
            throw new UnauthorizedException('Google Authorization Error');
        }
    }

    async signupWithGoogle(idToken: string, legalAcceptance?: LegalAcceptanceItemDto[], ctx?: AuthRequestContext) {
        try {
            const gdata = await this.checkGoogleToken(idToken)
            const { sub: googleId, email, name, picture } = gdata;

            const candidateUser = await this.userService.getCandidateByEmail(email);
            if (candidateUser) {
                this.logger.warn('Google email already exist')
                throw new UnauthorizedException('Email already exist');
            }

            const user = await this.userService.create({
                email,
                name,
                isActivated: true,
                roles: [{ value: 'USER', description: 'Customer' }],
                googleId,
                authType: 'google',
                avatar: picture,
            });

            const token = await this.generateToken(user)
            if (token) {
                await this.authLog(user, { type: 'signup' })
                await this.safeRecordAcceptance(user.id, legalAcceptance, 'signup', ctx)
                this.logger.log('User successfully signup via google', user.email)
                return { token, user };
            }

            this.logger.warn("Generate token error for google account")
            throw new HttpException('Authorization error', HttpStatus.BAD_REQUEST);

        } catch (e) {
            this.logger.error('Google Authorization Error')
            throw new UnauthorizedException('Google Authorization Error');
        }
    }

    private async checkGoogleToken(idToken: string) {
        const ticket = await this.googleClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload) {
            this.logger.error('Invalid Google token')
            throw new UnauthorizedException('Invalid Google token');
        }

        // const { email_verified } = payload;

        if (!payload.email_verified) {
            throw new UnauthorizedException('Google email not verified');
        }

        return payload

    }

    /** Поля, которые подписывает Telegram Login Widget (см. core.telegram.org/widgets/login). */
    private static readonly TELEGRAM_LOGIN_FIELDS = [
        'id',
        'first_name',
        'last_name',
        'username',
        'photo_url',
        'auth_date',
    ] as const;

    private checkTgHash(data: TelegramAuthDto) {
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

        if (!BOT_TOKEN) {
            this.logger.error('TELEGRAM_BOT_TOKEN is not set');
            return false;
        }

        if (!data.hash) {
            this.logger.warn('Telegram auth: hash is missing');
            return false;
        }

        const authDate = Number(data.auth_date);
        if (!Number.isFinite(authDate)) {
            this.logger.warn('Telegram auth: invalid auth_date');
            return false;
        }
        const maxAgeSec = 86400;
        if (Math.floor(Date.now() / 1000) - authDate > maxAgeSec) {
            this.logger.warn('Telegram auth: auth_date expired');
            return false;
        }

        const checkHash = data.hash;
        const dataCheckString = [...AuthService.TELEGRAM_LOGIN_FIELDS]
            .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== '')
            .sort()
            .map((key) => `${key}=${data[key]}`)
            .join('\n');

        const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
        const hmac = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');

        if (hmac !== checkHash) {
            this.logger.warn(
                `Telegram hash mismatch. Signed fields: ${AuthService.TELEGRAM_LOGIN_FIELDS.filter(
                    (k) => data[k] !== undefined && data[k] !== null && data[k] !== '',
                ).join(',')}`,
            );
            return false;
        }
        return true;
    }


    async signupWithTelegram(data: TelegramAuthDto, ctx?: AuthRequestContext) {

        if (!this.checkTgHash(data)) {
            this.logger.error('Telegram Authorization Error')
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
            name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
            telegramId: String(data.id),
            isActivated: true,
            authType: 'telegram',
            avatar: data.photo_url,
            roles
        });

        // Генерим JWT
        const token = await this.generateToken(user)

        if (token) {
            await this.authLog(user, { type: 'signup' })
            await this.safeRecordAcceptance(user.id, data.legalAcceptance, 'signup', ctx)
            this.logger.log('User successfully signup via telegram', user.name)
            return { token, user };
        }

        this.logger.error("Generate token error for telegram account")
        throw new HttpException('Authorization error', HttpStatus.BAD_REQUEST);
    }

    async loginWithTelegram(data: TelegramAuthDto, ctx?: AuthRequestContext) {

        if (!this.checkTgHash(data)) {
            this.logger.error('Telegram Authorization Error')
            throw new UnauthorizedException('Invalid Telegram data');
        }


        // Ищем пользователя по telegram_id
        const user = await this.userService.getCandidateByTelegramId(data.id);

        if (!user) {
            this.logger.warn('TelegramId not exist!', data.id)
            throw new UnauthorizedException('User not exist');
        }

        user.authType = 'telegram';
        user.telegramId = String(data.id);
        user.name = `${data.first_name || ''} ${data.last_name || ''}`.trim();
        if (data.photo_url !== user.avatar) {
            user.avatar = data.photo_url
        }
        await user.save()
        // Генерим JWT
        const token = await this.generateToken(user)

        if (token) {
            await this.authLog(user, { type: 'login' })
            await this.safeRecordAcceptance(user.id, data.legalAcceptance, 'login', ctx)
            this.logger.log(`User successfully login via ${user.authType}`, user.email)
            return { token, user };
        }

        this.logger.error("Generate token error for telegram account")
        throw new HttpException('Authorization error', HttpStatus.BAD_REQUEST);
    }

}

