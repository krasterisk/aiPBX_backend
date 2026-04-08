import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailerService } from '../mailer/mailer.service';
import { TelegramService } from '../telegram/telegram.service';
import { LoggerService } from '../logger/logger.service';

describe('AuthService', () => {
    let service: AuthService;
    let mockUsersService: any;
    let mockJwtService: any;
    let mockMailerService: any;
    let mockTelegramService: any;
    let mockLogService: any;

    const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        roles: [{ value: 'USER' }],
        vpbx_user_id: null,
        isActivated: false,
        activationCode: null,
        activationExpires: null,
        authType: null,
        googleId: null,
        telegramId: null,
        avatar: null,
        save: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
        mockUsersService = {
            getCandidateByEmail: jest.fn(),
            getCandidateByTelegramId: jest.fn(),
            getUserByUsername: jest.fn(),
            create: jest.fn(),
        };
        mockJwtService = {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
        };
        mockMailerService = {
            sendActivationMail: jest.fn().mockResolvedValue({ success: true }),
        };
        mockTelegramService = {
            sendMessage: jest.fn().mockResolvedValue(undefined),
        };
        mockLogService = {
            logAction: jest.fn().mockResolvedValue(undefined),
        };

        // Reset mock user state
        mockUser.save.mockClear();
        mockUser.isActivated = false;
        mockUser.activationCode = null;
        mockUser.activationExpires = null;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: UsersService, useValue: mockUsersService },
                { provide: JwtService, useValue: mockJwtService },
                { provide: MailerService, useValue: mockMailerService },
                { provide: TelegramService, useValue: mockTelegramService },
                { provide: LoggerService, useValue: mockLogService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
    });

    // ═══════════════════════════════════════════════════════════════════
    // login (email OTP)
    // ═══════════════════════════════════════════════════════════════════

    describe('login', () => {
        it('should throw when email is empty', async () => {
            await expect(service.login({ email: '' }))
                .rejects.toThrow(HttpException);

            try {
                await service.login({ email: '' });
            } catch (e) {
                expect(e.getStatus()).toBe(HttpStatus.BAD_REQUEST);
                expect(e.message).toContain('Email is empty');
            }
        });

        it('should throw when email is not found in DB', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(null);

            await expect(service.login({ email: 'nonexistent@example.com' }))
                .rejects.toThrow('Email not found');
        });

        it('should generate 6-digit activation code and save it', async () => {
            const candidate = { ...mockUser, save: jest.fn().mockResolvedValue(undefined) };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            await service.login({ email: 'test@example.com' });

            expect(candidate.activationCode).toMatch(/^\d{6}$/);
            expect(candidate.activationExpires).toBeGreaterThan(Date.now());
            expect(candidate.save).toHaveBeenCalled();
        });

        it('should set activation expiration to ~10 minutes', async () => {
            const candidate = { ...mockUser, save: jest.fn().mockResolvedValue(undefined) };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            const before = Date.now();
            await service.login({ email: 'test@example.com' });

            const tenMinutes = 10 * 60 * 1000;
            expect(candidate.activationExpires).toBeGreaterThanOrEqual(before + tenMinutes - 100);
            expect(candidate.activationExpires).toBeLessThanOrEqual(before + tenMinutes + 1000);
        });

        it('should send activation mail and return success', async () => {
            const candidate = { ...mockUser, save: jest.fn().mockResolvedValue(undefined) };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            const result = await service.login({ email: 'test@example.com' });

            expect(mockMailerService.sendActivationMail).toHaveBeenCalledWith(
                'test@example.com',
                expect.stringMatching(/^\d{6}$/),
            );
            expect(result).toEqual({ success: true });
        });

        it('should throw when mail sending fails', async () => {
            const candidate = { ...mockUser, save: jest.fn().mockResolvedValue(undefined) };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);
            mockMailerService.sendActivationMail.mockResolvedValue({ success: false });

            await expect(service.login({ email: 'test@example.com' }))
                .rejects.toThrow('Error while sending activation code');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // signup
    // ═══════════════════════════════════════════════════════════════════

    describe('signup', () => {
        it('should throw when email is empty', async () => {
            await expect(service.signup({ email: '' }))
                .rejects.toThrow('Email is empty');
        });

        it('should throw when user already exists', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(mockUser);

            await expect(service.signup({ email: 'test@example.com' }))
                .rejects.toThrow('User already exists');
        });

        it('should create user with USER role', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            await service.signup({ email: 'new@example.com' });

            expect(mockUsersService.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    email: 'new@example.com',
                    roles: [{ value: 'USER', description: 'CUSTOMER' }],
                    activationCode: expect.stringMatching(/^\d{6}$/),
                    activationExpires: expect.any(Number),
                }),
            );
        });

        it('should send activation mail after creating user', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const result = await service.signup({ email: 'new@example.com' });

            expect(mockMailerService.sendActivationMail).toHaveBeenCalledWith(
                'new@example.com',
                expect.stringMatching(/^\d{6}$/),
            );
            expect(result).toEqual({ success: true });
        });

        it('should throw when user creation fails', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(null);

            await expect(service.signup({ email: 'new@example.com' }))
                .rejects.toThrow('Signup error');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // activate
    // ═══════════════════════════════════════════════════════════════════

    describe('activate', () => {
        it('should throw when activation code is empty', async () => {
            await expect(
                service.activate({ activationCode: '', email: 'test@example.com' }),
            ).rejects.toThrow(HttpException);
        });

        it('should throw when email is empty', async () => {
            await expect(
                service.activate({ activationCode: '123456', email: '' }),
            ).rejects.toThrow(HttpException);
        });

        it('should throw 404 when user not found', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue(null);

            try {
                await service.activate({ activationCode: '123456', email: 'nobody@example.com' });
            } catch (e) {
                expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
            }
        });

        it('should throw when activation code on user is empty', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue({
                ...mockUser,
                activationCode: null,
                activationExpires: Date.now() + 600000,
            });

            await expect(
                service.activate({ activationCode: '123456', email: 'test@example.com' }),
            ).rejects.toThrow('Activation code is wrong');
        });

        it('should throw when activation code is expired', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue({
                ...mockUser,
                activationCode: '123456',
                activationExpires: Date.now() - 1000, // expired
            });

            await expect(
                service.activate({ activationCode: '123456', email: 'test@example.com' }),
            ).rejects.toThrow('Activation code expired');
        });

        it('should throw when activation code does not match', async () => {
            mockUsersService.getCandidateByEmail.mockResolvedValue({
                ...mockUser,
                activationCode: '654321',
                activationExpires: Date.now() + 600000,
            });

            await expect(
                service.activate({ activationCode: '123456', email: 'test@example.com' }),
            ).rejects.toThrow('Invalid activation code');
        });

        it('should trim activation code before comparison', async () => {
            const candidate = {
                ...mockUser,
                activationCode: '123456',
                activationExpires: Date.now() + 600000,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            const result = await service.activate({
                activationCode: ' 123456 ',
                email: 'test@example.com',
            });

            expect(result.token).toBe('mock-jwt-token');
        });

        it('should activate user, clear code, set authType, and return token', async () => {
            const candidate = {
                ...mockUser,
                activationCode: '123456',
                activationExpires: Date.now() + 600000,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            const result = await service.activate({
                activationCode: '123456',
                email: 'test@example.com',
            });

            expect(candidate.isActivated).toBe(true);
            expect(candidate.activationCode).toBeNull();
            expect(candidate.activationExpires).toBeNull();
            expect(candidate.authType).toBe('email');
            expect(candidate.save).toHaveBeenCalled();
            expect(result.token).toBe('mock-jwt-token');
            expect(result.user).toBe(candidate);
        });

        it('should generate JWT with correct payload', async () => {
            const candidate = {
                ...mockUser,
                id: 42,
                roles: [{ value: 'ADMIN' }],
                vpbx_user_id: 'vpbx-123',
                activationCode: '111111',
                activationExpires: Date.now() + 600000,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            await service.activate({ activationCode: '111111', email: 'test@example.com' });

            expect(mockJwtService.sign).toHaveBeenCalledWith({
                id: 42,
                roles: [{ value: 'ADMIN' }],
                vpbx_user_id: 'vpbx-123',
            });
        });

        it('should log auth event to Telegram and logger', async () => {
            const candidate = {
                ...mockUser,
                activationCode: '123456',
                activationExpires: Date.now() + 600000,
                save: jest.fn().mockResolvedValue(undefined),
            };
            mockUsersService.getCandidateByEmail.mockResolvedValue(candidate);

            await service.activate({
                activationCode: '123456',
                email: 'test@example.com',
                type: 'login',
            });

            expect(mockTelegramService.sendMessage).toHaveBeenCalled();
            expect(mockLogService.logAction).toHaveBeenCalledWith(
                candidate.id,
                'login',
                'user',
                candidate.id,
                expect.stringContaining('login'),
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // create (admin user creation with password)
    // ═══════════════════════════════════════════════════════════════════

    describe('create', () => {
        it('should throw when username already exists', async () => {
            mockUsersService.getUserByUsername.mockResolvedValue(mockUser);

            await expect(
                service.create({ username: 'existing', password: 'pass123' }),
            ).rejects.toThrow(HttpException);
        });

        it('should hash password before creating user', async () => {
            mockUsersService.getUserByUsername.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            await service.create({ username: 'newuser', password: 'pass123' });

            const createCall = mockUsersService.create.mock.calls[0][0];
            expect(createCall.password).not.toBe('pass123');
            expect(createCall.password).toBeDefined();
            expect(createCall.password.length).toBeGreaterThan(10); // bcrypt hash
        });

        it('should return created user', async () => {
            mockUsersService.getUserByUsername.mockResolvedValue(null);
            mockUsersService.create.mockResolvedValue(mockUser);

            const result = await service.create({ username: 'newuser', password: 'pass123' });
            expect(result).toEqual(mockUser);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // signupWithTelegram
    // ═══════════════════════════════════════════════════════════════════

    describe('signupWithTelegram', () => {
        // We can't fully test checkTgHash without setting TELEGRAM_BOT_TOKEN env,
        // but we can test the flow when hash validation fails

        it('should throw UnauthorizedException when hash is invalid', async () => {
            // Without TELEGRAM_BOT_TOKEN env → checkTgHash returns false
            await expect(
                service.signupWithTelegram({
                    id: 12345,
                    first_name: 'Test',
                    auth_date: Math.floor(Date.now() / 1000),
                    hash: 'invalid-hash',
                }),
            ).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('loginWithTelegram', () => {
        it('should throw UnauthorizedException when hash is invalid', async () => {
            await expect(
                service.loginWithTelegram({
                    id: 12345,
                    first_name: 'Test',
                    auth_date: Math.floor(Date.now() / 1000),
                    hash: 'invalid-hash',
                }),
            ).rejects.toThrow(UnauthorizedException);
        });
    });
});
