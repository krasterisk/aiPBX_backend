import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { InjectConnection } from "@nestjs/sequelize";
import { Sequelize, Transaction } from "sequelize";
import { User } from "../users/users.model";
import { CreateUserDto } from "./dto/create-user.dto";
import { CreateSubUserDto } from "./dto/create-sub-user.dto";
import { RolesService } from "../roles/roles.service";
import { AddRoleDto } from "./dto/add-role.dto";
import sequelize from "sequelize";
import { GetUsersDto } from "./dto/getUsers.dto";
import { FilesService } from "../files/files.service";
import { Rates } from "../currency/rates.model";
import { PricesService } from "../prices/prices.service";
import { CreatePriceDto } from "../prices/dto/create-price.dto";
import { UserLimits } from "./user-limits.model";
import { CreateUserLimitDto } from "./dto/create-user-limit.dto";
import { MailerService } from "../mailer/mailer.service";
import { Payments } from "../payments/payments.model";
import { AdminTopUpDto } from "./dto/admin-top-up.dto";
import { getTenantCurrency } from '../shared/tenant/tenant-currency';
import { BalanceLedger, BalanceLedgerSource } from "../accounting/balance-ledger.model";
import { CurrencyService } from '../currency/currency.service';

export interface BalanceCreditOptions {
    source?: BalanceLedgerSource;
    externalId?: string | null;
    paymentId?: string | null;
    documentId?: string | null;
    meta?: Record<string, unknown> | null;
    transaction?: Transaction;
}

export interface BalanceDebitOptions {
    source?: BalanceLedgerSource;
    externalId?: string | null;
    meta?: Record<string, unknown> | null;
    transaction?: Transaction;
}

@Injectable()
export class UsersService {

    private readonly logger = new Logger(UsersService.name);

    constructor(@InjectModel(User) private usersRepository: typeof User,
        @InjectModel(Rates) private ratesRepository: typeof Rates,
        private fileService: FilesService,
        private roleService: RolesService,
        private priceService: PricesService,
        @InjectModel(UserLimits) private userLimitsRepository: typeof UserLimits,
        @InjectModel(Payments) private paymentsRepository: typeof Payments,
        @InjectModel(BalanceLedger) private balanceLedgerRepository: typeof BalanceLedger,
        @InjectConnection() private readonly sequelize: Sequelize,
        private mailerService: MailerService,
        private readonly currencyService: CurrencyService,
    ) {
    }

    async create(dto: CreateUserDto) {
        try {
            // создаём пользователя
            const { currency: _dtoCurrency, ...createPayload } = dto as CreateUserDto & { currency?: string };
            const user = await this.usersRepository.create({
                ...createPayload,
                currency: getTenantCurrency(),
            } as any);

            if (!user) {
                this.logger.warn("User not created");
                throw new HttpException({ message: "User not created" }, HttpStatus.BAD_REQUEST);
            }

            // устанавливаем роли
            const roleValues = dto.roles.map(r => r.value);
            const roles = await Promise.all(roleValues.map(v => this.roleService.getRoleByValue(v)));

            const validRoles = roles.filter(r => r !== null);
            if (validRoles.length === 0) {
                await this.usersRepository.destroy({ where: { id: user.id } });
                this.logger.warn("Role not found");
                throw new HttpException({ message: "Role not found" }, HttpStatus.NOT_FOUND);
            }

            await user.$set("roles", validRoles.map(r => r.id));

            const price: CreatePriceDto = {
                userId: user.id,
                realtime: 35,
                analytic: 5,
                text: 1,
                stt: 0.1
            }
            await this.priceService.create(price)

            // подгружаем юзера заново с ролями
            const userWithRoles = await this.usersRepository.findByPk(user.id, {
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });


            return userWithRoles;

        } catch (e) {
            this.logger.error("User creation error", e);
            throw new HttpException({ message: "User creation error" }, HttpStatus.BAD_REQUEST);
        }
    }

    async createSubUser(ownerUserId: number, dto: CreateSubUserDto) {
        try {
            // Проверяем, что owner существует и является root user
            const owner = await this.usersRepository.findByPk(ownerUserId);
            if (!owner) {
                throw new HttpException('Owner user not found', HttpStatus.NOT_FOUND);
            }
            if (owner.vpbx_user_id !== null && owner.vpbx_user_id !== undefined) {
                throw new HttpException(
                    'Sub-users cannot create other users',
                    HttpStatus.FORBIDDEN,
                );
            }

            // Проверяем, что email не занят
            const existing = await this.usersRepository.findOne({ where: { email: dto.email } });
            if (existing) {
                throw new HttpException('User with this email already exists', HttpStatus.BAD_REQUEST);
            }

            const user = await this.usersRepository.create({
                email: dto.email,
                password: dto.password || null,
                vpbx_user_id: ownerUserId,
                balance: 0,
                currency: owner.currency || getTenantCurrency(),
            } as any);

            if (!user) {
                throw new HttpException('Sub-user creation failed', HttpStatus.BAD_REQUEST);
            }

            // Устанавливаем имя и флаг активации
            await user.update({
                name: dto.name || null,
                isActivated: true,
            });

            // Назначаем роль USER
            const role = await this.roleService.getRoleByValue('USER');
            if (role) {
                await user.$set('roles', [role.id]);
            }

            // Копируем цены owner
            let ownerPrice = null;
            try {
                ownerPrice = await this.priceService.findByUserId(ownerUserId);
            } catch {}
            const price: CreatePriceDto = {
                userId: user.id,
                realtime: ownerPrice?.realtime ?? 35,
                analytic: ownerPrice?.analytic ?? 5,
                text: ownerPrice?.text ?? 1,
                stt: ownerPrice?.stt ?? 0.1,
            };
            await this.priceService.create(price);

            this.logger.log(`Sub-user ${dto.email} created for owner #${ownerUserId}`);

            // Возвращаем пользователя с ролями
            return await this.usersRepository.findByPk(user.id, {
                include: { all: true },
                attributes: {
                    exclude: [
                        'password',
                        'activationCode',
                        'resetPasswordLink',
                        'googleId',
                        'telegramId',
                        'activationExpires',
                        'isActivated',
                    ],
                },
            });
        } catch (e) {
            if (e instanceof HttpException) throw e;
            this.logger.error('Sub-user creation error', e);
            throw new HttpException('Sub-user creation error', HttpStatus.BAD_REQUEST);
        }
    }

    async getSubUsers(ownerUserId: number) {
        return this.usersRepository.findAll({
            where: { vpbx_user_id: ownerUserId },
            include: { all: true },
            attributes: {
                exclude: [
                    'password',
                    'activationCode',
                    'resetPasswordLink',
                    'googleId',
                    'telegramId',
                    'activationExpires',
                    'isActivated',
                ],
            },
        });
    }

    async resolveOwnerId(userId: string | number): Promise<number> {
        const user = await this.usersRepository.findByPk(userId, {
            attributes: ['id', 'vpbx_user_id'],
        });
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }
        return user.vpbx_user_id ?? user.id;
    }


    async getAllUsers() {
        try {
            const user = await this.usersRepository.findAll({
                where: { vpbx_user_id: null },
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });
            return user;
        } catch (e) {
            this.logger.warn("Users not found", e)
            throw new HttpException("Users not found", HttpStatus.NOT_FOUND);
        }
    }

    async get(query: GetUsersDto, isAdmin: boolean, tokenUserId: string) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const sort = query.sort;
            const order = query.order;
            const search = query.search;
            const offset = (page - 1) * limit;

            const userIdClause = !isAdmin && tokenUserId &&
            {
                [sequelize.Op.or]: [
                    {
                        id: tokenUserId
                    },
                    {
                        vpbx_user_id: tokenUserId
                    }
                ]
            }

            const users = await this.usersRepository.findAndCountAll({
                offset,
                limit,
                distinct: true,
                order: [
                    [sort, order]
                ],
                where:
                {
                    [sequelize.Op.and]: [
                        {
                            [sequelize.Op.or]: [
                                {
                                    name: {
                                        [sequelize.Op.like]: `%${search}%`
                                    }
                                },
                                {
                                    email: {
                                        [sequelize.Op.like]: `%${search}%`
                                    }
                                }
                            ]
                        },
                        userIdClause
                    ]
                },
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            }
            );
            if (users) {
                return users;
            }
        } catch (e) {
            this.logger.warn("Request error", e)
            throw new HttpException({ message: "Request error" }, HttpStatus.BAD_REQUEST);
        }
    }

    async getUserByEmail(email: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { email, isActivated: true },
                include: { all: true },
                plain: true
            });

            if (!user) {
                this.logger.warn("User not found")
                throw new UnauthorizedException({ message: "Authorization Error" });
            }

            if (user.vpbx_user_id) {
                const ownerBalance = await this.getUserBalance(String(user.vpbx_user_id));
                if (typeof user.setDataValue === 'function') {
                    user.setDataValue('balance', ownerBalance.balance);
                    user.setDataValue('currency', ownerBalance.currency);
                } else {
                    user.balance = ownerBalance.balance;
                    user.currency = ownerBalance.currency;
                }
            }

            return user;

        } catch (e) {
            this.logger.warn("User not found", e)
            throw new UnauthorizedException({ message: "Authorization Error" });
        }
    }

    async getCandidateByEmail(email: string) {

        const user = await this.usersRepository.findOne({
            where: { email },
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "isActivated"
                ]
            }
        });
        if (!user) {
            // this.logger.warn("User not found")
            // new UnauthorizedException({message: "E-mail not found"});
            return;
        }

        return user;
    }

    async getUserProfile() {
        try {
            const user = await this.usersRepository.findAll({
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });
            return user[0];
        } catch (e) {
            this.logger.warn("Users not found", e)
            throw new HttpException("Users not found", HttpStatus.NOT_FOUND);
        }
    }

    async updateUserProfile(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "activationCode",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "activationExpires",
                    "isActivated"
                ]
            }
        });
        if (!user) {
            this.logger.warn("Users not found")
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
        await user.update(updates);
        return user;
    }

    async updateUserBalance(id: string, amountToAdd: number, opts?: BalanceCreditOptions) {
        if (id === undefined || id === null || id === '' || amountToAdd === undefined || amountToAdd === null) {
            this.logger.warn('id or amount not found');
            return false;
        }
        const ownerId = await this.resolveOwnerId(id);
        const source: BalanceLedgerSource = opts?.source ?? 'admin';

        const run = async (transaction: Transaction) => {
            const user = await this.usersRepository.findByPk(ownerId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            if (!user) {
                this.logger.warn('User not found');
                return false;
            }

            if (opts?.externalId) {
                const existing = await this.balanceLedgerRepository.findOne({
                    where: { source, externalId: opts.externalId },
                    transaction,
                });
                if (existing) {
                    return true;
                }
            }

            const before = Number(user.balance);
            const after = before + Number(amountToAdd);
            await user.update({ balance: after }, { transaction });

            await this.balanceLedgerRepository.create(
                {
                    userId: String(ownerId),
                    direction: 'credit',
                    amountUsd: Math.abs(Number(amountToAdd)).toFixed(4),
                    balanceBeforeUsd: before.toFixed(4),
                    balanceAfterUsd: after.toFixed(4),
                    source,
                    externalId: opts?.externalId ?? null,
                    paymentId: opts?.paymentId ?? null,
                    documentId: opts?.documentId ?? null,
                    meta: opts?.meta ?? null,
                },
                { transaction },
            );
            return true;
        };

        if (opts?.transaction) {
            return run(opts.transaction);
        }
        return this.sequelize.transaction((t) => run(t));
    }

    async decrementUserBalance(id: string, amountToDec: number, opts?: BalanceDebitOptions) {
        if (id === undefined || id === null || id === '' || !amountToDec) {
            this.logger.warn('id or amount not found');
            return false;
        }
        const ownerId = await this.resolveOwnerId(id);
        const source: BalanceLedgerSource = opts?.source ?? 'usage_realtime';

        const run = async (transaction: Transaction) => {
            const user = await this.usersRepository.findByPk(ownerId, {
                transaction,
                lock: transaction.LOCK.UPDATE,
                attributes: ['id', 'balance', 'email'],
            });
            if (!user) {
                this.logger.warn('User not found');
                return false;
            }

            if (opts?.externalId) {
                const existing = await this.balanceLedgerRepository.findOne({
                    where: { source, externalId: opts.externalId },
                    transaction,
                });
                if (existing) {
                    return true;
                }
            }

            const limit = await this.userLimitsRepository.findOne({ where: { userId: ownerId }, transaction });

            const before = Number(user.balance);
            const after = before - Number(amountToDec);
            await user.update({ balance: after }, { transaction });

            await this.balanceLedgerRepository.create(
                {
                    userId: String(ownerId),
                    direction: 'debit',
                    amountUsd: Math.abs(Number(amountToDec)).toFixed(4),
                    balanceBeforeUsd: before.toFixed(4),
                    balanceAfterUsd: after.toFixed(4),
                    source,
                    externalId: opts?.externalId ?? null,
                    meta: opts?.meta ?? null,
                },
                { transaction },
            );

            const newBalance = after;
            const oldBalanceApprox = before;

            if (limit && limit.emails && limit.emails.length > 0) {
                if (oldBalanceApprox >= limit.limitAmount && newBalance < limit.limitAmount) {
                    this.mailerService.sendLowBalanceNotification(limit.emails, newBalance, limit.limitAmount);
                }
            }

            if (oldBalanceApprox > 3 && newBalance <= 3) {
                const limitEmails = limit?.emails || [];
                const recipients = [...new Set([...limitEmails, user.email])].filter(Boolean);
                this.mailerService.sendCriticalBalanceNotification(recipients, newBalance);
            }

            if (oldBalanceApprox > 0 && newBalance <= 0) {
                const limitEmails = limit?.emails || [];
                const recipients = [...new Set([...limitEmails, user.email])].filter(Boolean);
                this.mailerService.sendZeroBalanceNotification(recipients, newBalance);
            }

            return true;
        };

        if (opts?.transaction) {
            return run(opts.transaction);
        }
        return this.sequelize.transaction((t) => run(t));
    }

    async getUserByUsername(username: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { username, isActivated: true },
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });

            return user;

        } catch (e) {
            this.logger.warn('User not found', e);
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
    }

    async getUserBalance(id: string) {
        // Разрешаем owner ID для sub-users
        const ownerId = await this.resolveOwnerId(id);

        const user = await this.usersRepository.findOne({
            where: { id: ownerId },
            attributes: ['balance', 'currency']
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const balanceUsd = Number(user.balance) || 0;
        const displayCurrency = getTenantCurrency();
        const { amount: balance, rate } = await this.currencyService.convertFromUsd(balanceUsd, displayCurrency);

        return {
            balance,
            balanceUsd,
            currency: displayCurrency,
            rate,
        };
    }


    async getMe(id: string) {
        if (!id) {
            this.logger.warn('No id!');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const user = await this.usersRepository.findOne({
            where: { id },
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "activationCode",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "activationExpires",
                    "isActivated"
                ]
            }
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        if (user.vpbx_user_id) {
            const ownerBalance = await this.getUserBalance(String(user.vpbx_user_id));
            if (typeof user.setDataValue === 'function') {
                user.setDataValue('balance', ownerBalance.balance);
                user.setDataValue('currency', ownerBalance.currency);
            } else {
                user.balance = ownerBalance.balance;
                user.currency = ownerBalance.currency;
            }
        }

        return user
    }

    async getUserById(id: string | number, tokenId: string | number, isAdmin: boolean) {
        try {
            const user = await this.usersRepository.findOne({
                where: { id },
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });

            if (!user) {
                throw new HttpException("User not found", HttpStatus.NOT_FOUND);
            }

            if (user.vpbx_user_id) {
                const ownerBalance = await this.getUserBalance(String(user.vpbx_user_id));
                if (typeof user.setDataValue === 'function') {
                    user.setDataValue('balance', ownerBalance.balance);
                    user.setDataValue('currency', ownerBalance.currency);
                } else {
                    user.balance = ownerBalance.balance;
                    user.currency = ownerBalance.currency;
                }
            }

            const isCanEdit =
                user.id === Number(tokenId) ||
                user.vpbx_user_id === Number(tokenId)

            if (!isAdmin && !isCanEdit) {
                this.logger.warn('Edit Forbidden');
                throw new HttpException(
                    "Editing Forbidden", HttpStatus.FORBIDDEN
                );
            }
            return user;
        } catch (e) {
            this.logger.warn('User not found', e);
            throw new HttpException(
                "User not found", HttpStatus.NOT_FOUND
            );
        }
    }

    async addRole(dto: AddRoleDto) {
        const user = await this.usersRepository.findOne({
            where: { id: dto.userId },
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "activationCode",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "activationExpires",
                    "isActivated"
                ]
            }
        });
        const role = await this.roleService.getRoleByValue(dto.value);
        if (role && user) {
            await user.$add("roles", role.id);
            return user.reload();
        }
        this.logger.warn('User or role not found');
        throw new HttpException("User or Role not found", HttpStatus.NOT_FOUND);
    }

    async removeRole(dto: AddRoleDto) {
        const user = await this.usersRepository.findOne({
            where: { id: dto.userId },
            include: { all: true }
        });
        const role = await this.roleService.getRoleByValue(dto.value);
        if (role && user) {
            await user.$remove("roles", role.id);
            return user.reload();
        }
        this.logger.warn('User or role not found');
        throw new HttpException("User or Role not found", HttpStatus.NOT_FOUND);
    }

    async updateUser(updates: any, isAdmin = true) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true }
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }

        const payload = { ...updates };
        if (!isAdmin && 'currency' in payload) {
            delete payload.currency;
        } else if (isAdmin && payload.currency != null && payload.currency !== user.currency) {
            this.logger.warn(
                `Admin changed user ${user.id} currency ${user.currency} → ${payload.currency}`,
            );
        }

        await user.update(payload);

        if (updates.roles && Array.isArray(updates.roles)) {
            const roleValues = updates.roles.map(r => r.value);
            const roles = await Promise.all(
                roleValues.map(v => this.roleService.getRoleByValue(v))
            );
            const validRoles = roles.filter(r => r !== null);

            await user.$set("roles", validRoles.map(r => r.id));
        }

        return user.reload({
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "activationCode",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "activationExpires",
                    "isActivated"
                ]
            }
        });
    }

    async updateUserAvatar(updates: Partial<User>, image: any) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true },
            attributes: {
                exclude: [
                    "password",
                    "activationCode",
                    "resetPasswordLink",
                    "googleId",
                    "telegramId",
                    "activationExpires",
                    "isActivated"
                ]
            }
        });
        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }

        const filename = await this.fileService.createFile(image);

        await user.update({ ...updates, avatar: filename });
        return user;
    }


    async deleteUser(id: number, requesterId?: number) {
        const user = await this.usersRepository.findByPk(id, {
            attributes: ['id', 'vpbx_user_id'],
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        // Если удаляется root user — проверяем, нет ли sub-users
        if (user.vpbx_user_id === null || user.vpbx_user_id === undefined) {
            const subUsersCount = await this.usersRepository.count({ where: { vpbx_user_id: id } });
            if (subUsersCount > 0) {
                throw new HttpException(
                    `Cannot delete owner: ${subUsersCount} sub-user(s) still linked`,
                    HttpStatus.BAD_REQUEST,
                );
            }
        }

        // Если requester указан — проверяем права
        if (requesterId && user.vpbx_user_id !== null) {
            if (user.vpbx_user_id !== requesterId && user.id !== requesterId) {
                throw new HttpException('Forbidden: not your sub-user', HttpStatus.FORBIDDEN);
            }
        }

        await this.usersRepository.destroy({ where: { id } });
        return { message: 'User deleted successfully', statusCode: HttpStatus.OK };
    }

    async getCandidateByTelegramId(telegramId: number | string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { telegramId: String(telegramId) },
                include: { all: true },
                attributes: {
                    exclude: [
                        "password",
                        "activationCode",
                        "resetPasswordLink",
                        "googleId",
                        "telegramId",
                        "activationExpires",
                        "isActivated"
                    ]
                }
            });
            return user;

        } catch (e) {
            this.logger.warn("Error get user by TelegramId", e)
            throw new UnauthorizedException({ message: "Authorization Error" });
        }
    }

    async setUsageLimit(dto: CreateUserLimitDto) {
        try {
            const userId = Number(dto.userId);
            if (isNaN(userId)) {
                throw new HttpException("Invalid User ID", HttpStatus.BAD_REQUEST);
            }

            const existingLimit = await this.userLimitsRepository.findOne({ where: { userId } });

            if (existingLimit) {
                await existingLimit.update({
                    limitAmount: dto.limitAmount,
                    emails: dto.emails
                });
                return existingLimit;
            } else {
                return await this.userLimitsRepository.create({
                    userId: userId,
                    limitAmount: dto.limitAmount,
                    emails: dto.emails
                });
            }
        } catch (e) {
            this.logger.error("Error setting usage limit", e);
            throw new HttpException("Error setting usage limit", HttpStatus.BAD_REQUEST);
        }
    }

    async getUsageLimit(userId: number) {
        try {
            if (isNaN(userId)) {
                throw new HttpException("Invalid User ID", HttpStatus.BAD_REQUEST);
            }
            return await this.userLimitsRepository.findOne({ where: { userId } });
        } catch (e) {
            this.logger.error("Error getting usage limit", e);
            throw new HttpException("Error getting usage limit", HttpStatus.BAD_REQUEST);
        }
    }

    async adminTopUpBalance(dto: AdminTopUpDto) {
        const user = await this.usersRepository.findByPk(dto.userId);
        if (!user) {
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }

        const currency = dto.currency || 'USD';
        const payment = await this.paymentsRepository.create({
            userId: String(dto.userId),
            amount: dto.amount,
            currency,
            status: 'succeeded',
            paymentMethod: dto.paymentMethod,
            paymentInfo: dto.paymentInfo || 'Admin manual top-up',
        } as any);

        const isUpdated = await this.updateUserBalance(String(dto.userId), dto.amount, {
            source: 'admin',
            externalId: `payment_${payment.id}`,
            paymentId: String(payment.id),
        });
        if (!isUpdated) {
            throw new HttpException('Failed to update balance', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        this.logger.log(`Admin top-up: User ${dto.userId}, amount ${dto.amount} ${currency}, method: ${dto.paymentMethod}`);

        return {
            message: 'Balance topped up successfully',
            payment,
            newBalance: (await this.usersRepository.findByPk(dto.userId, { attributes: ['balance'] })).balance,
        };
    }

}
