import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { User } from "../users/users.model";
import { CreateUserDto } from "./dto/create-user.dto";
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
        private mailerService: MailerService
    ) {
    }

    async create(dto: CreateUserDto) {
        try {
            // создаём пользователя
            const user = await this.usersRepository.create(dto);

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
                text: 1
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
                        "isActivated",
                        "vpbx_user_id"
                    ]
                }
            });


            return userWithRoles;

        } catch (e) {
            this.logger.error("User creation error", e);
            throw new HttpException({ message: "User creation error" }, HttpStatus.BAD_REQUEST);
        }
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
                        "isActivated",
                        "vpbx_user_id"
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
                        "isActivated",
                        "vpbx_user_id"
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
                    "isActivated",
                    "vpbx_user_id"
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
                        "isActivated",
                        "vpbx_user_id"
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
                    "isActivated",
                    "vpbx_user_id"
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

    async updateUserBalance(id: string, amountToAdd: number) {

        if (!id && !amountToAdd) {
            this.logger.warn('id or amount not found');
            return false
        }
        const [affectedRows] = await this.usersRepository.increment('balance', {
            by: amountToAdd,
            where: { id }
        });

        if (affectedRows.length === 0) {
            this.logger.warn("User not found")
            return false
        }
        return true
    }

    async decrementUserBalance(id: string, amountToDec: number) {
        if (!id && !amountToDec) {
            this.logger.warn('id or amount not found');
            return false
        }
        const limit = await this.userLimitsRepository.findOne({ where: { userId: id } });

        await this.usersRepository.decrement('balance', {
            by: amountToDec,
            where: { id }
        });


        const user = await this.usersRepository.findByPk(id, { attributes: ['balance', 'email'] });

        if (!user) {
            this.logger.warn('User not found');
            return false
        }

        const newBalance = user.balance;
        const oldBalanceApprox = newBalance + amountToDec;

        if (limit && limit.emails && limit.emails.length > 0) {
            // Check if we crossed the threshold downwards
            if (oldBalanceApprox >= limit.limitAmount && newBalance < limit.limitAmount) {
                this.mailerService.sendLowBalanceNotification(limit.emails, newBalance, limit.limitAmount);
            }
        }

        // Check if we crossed zero downwards
        if (oldBalanceApprox > 0 && newBalance <= 0) {
            const limitEmails = limit?.emails || [];
            const recipients = [...new Set([...limitEmails, user.email])].filter(Boolean);
            this.mailerService.sendZeroBalanceNotification(recipients, newBalance);
        }

        return true
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
                        "isActivated",
                        "vpbx_user_id"
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
        const user = await this.usersRepository.findOne({
            where: { id },
            attributes: ['balance', 'currency']
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
        }


        const currency = user.currency || 'USD'

        const currencyRate = await this.ratesRepository.findOne({
            where: { currency }
        });


        return {
            balance: user.balance,
            currency: user.currency,
            rate: currencyRate.rate
        }
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
                    "isActivated",
                    "vpbx_user_id"
                ]
            }
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException('User not found', HttpStatus.NOT_FOUND);
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
                        "isActivated",
                        "vpbx_user_id"
                    ]
                }
            });

            if (!user) {
                throw new HttpException("User not found", HttpStatus.NOT_FOUND);
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
                    "isActivated",
                    "vpbx_user_id"
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

    async updateUser(updates: any) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true }
        });

        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }

        await user.update(updates);

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
                    "isActivated",
                    "vpbx_user_id"
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
                    "isActivated",
                    "vpbx_user_id"
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


    async deleteUser(id: number) {
        const deleted = await this.usersRepository.destroy({ where: { id } });
        if (deleted === 0) {
            this.logger.warn('User not found');
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
        return { message: "User deleted successfully", statusCode: HttpStatus.OK };
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
                        "isActivated",
                        "vpbx_user_id"
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
        const isUpdated = await this.updateUserBalance(dto.userId, dto.amount);
        if (!isUpdated) {
            throw new HttpException('Failed to update balance', HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const payment = await this.paymentsRepository.create({
            userId: dto.userId,
            amount: dto.amount,
            currency,
            status: 'succeeded',
            paymentMethod: dto.paymentMethod,
            paymentInfo: dto.paymentInfo || 'Admin manual top-up',
        } as any);

        this.logger.log(`Admin top-up: User ${dto.userId}, amount ${dto.amount} ${currency}, method: ${dto.paymentMethod}`);

        return {
            message: 'Balance topped up successfully',
            payment,
            newBalance: (await this.usersRepository.findByPk(dto.userId, { attributes: ['balance'] })).balance,
        };
    }

}
