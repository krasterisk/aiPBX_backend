import {HttpException, HttpStatus, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { User } from "../users/users.model";
import { CreateUserDto } from "./dto/create-user.dto";
import { RolesService } from "../roles/roles.service";
import { AddRoleDto } from "./dto/add-role.dto";
import sequelize from "sequelize";
import { GetUsersDto } from "./dto/getUsers.dto";
import { FilesService } from "../files/files.service";
import { UpdatePasswordDto } from "./dto/updatePassword.dto";
import * as bcrypt from "bcryptjs";

@Injectable()
export class UsersService {

    private readonly logger = new Logger(UsersService.name);

    constructor(@InjectModel(User) private usersRepository: typeof User,
                private fileService: FilesService,
                private roleService: RolesService) {
    }

    async create(dto: CreateUserDto) {
        try {
            const user = await this.usersRepository.create(dto);
            if (user) {
                for (const roles of dto.roles) {
                    const role = await this.roleService.getRoleByValue(roles.value);
                    if (role) {
                        await user.$set("roles", [role.id]);
                        user.roles = [role];
                        return user;
                    }
                }
            }
            await this.usersRepository.destroy({ where: { email: dto.email } });
            this.logger.warn("Role not found")
            throw new HttpException({ message: "Role not found" }, HttpStatus.NOT_FOUND);

        } catch (e) {
            await this.usersRepository.destroy({ where: { email: dto.email } });
            this.logger.warn("Role not found", e)
            throw new HttpException({ message: "Role not found" }, HttpStatus.NOT_FOUND);

        }
    }

    async getAllUsers() {
        try {
            const user = await this.usersRepository.findAll({
                where: { vpbx_user_id: null },
                include: { all: true },
                attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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

            console.log(userIdClause,tokenUserId,isAdmin)


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
                    attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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
                include: { all: true }
            });

            if(!user) {
                this.logger.warn("User not found")
                throw new UnauthorizedException({ message: "Authorization Error"});
            }
            return user;

        } catch (e) {
            this.logger.warn("User not found", e)
            throw new UnauthorizedException({ message: "Authorization Error"});
        }
    }

    async getCandidateByEmail(email: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { email },
                include: { all: true }
            });
            return user;

        } catch (e) {
            this.logger.warn("User not found", e)
            throw new UnauthorizedException({ message: "Authorization Error"});
        }
    }

    async getUserProfile() {
        try {
            const user = await this.usersRepository.findAll({
                include: { all: true },
                attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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
            attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
        });
        if (!user) {
            this.logger.warn("Users not found")
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
        await user.update(updates);
        return user;
    }

    async updateUserBalance(id: string, amountToAdd: number) {

        if(!id && !amountToAdd) {
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
        if(!id && !amountToDec) {
            this.logger.warn('id or amount not found');
            return false
        }
        const [affectedRows] = await this.usersRepository.decrement('balance', {
            by: amountToDec,
            where: { id }
        });

        if (affectedRows.length === 0) {
            this.logger.warn('User not found');
            return false
        }
        return true
    }


    async getUserByUsername(username: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { username, isActivated: true },
                include: { all: true }
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

        return {
            balance: user.balance,
            currency: user.currency
        }
    }

    async getUserById(id: string | number,tokenId: string | number, isAdmin: boolean) {
        try {
            const user = await this.usersRepository.findOne({
                where: { id },
                include: { all: true },
                attributes: {
                    exclude: ["password", "activationLink", "resetPasswordLink"]
                }
            });

            const isCanEdit =
                user.id === Number(tokenId) ||
                user.vpbx_user_id === Number(tokenId)

            if(!isAdmin && !isCanEdit) {
                this.logger.warn('Edit Forbidden');
                throw new HttpException(
                    "Editing Forbidden", HttpStatus.NOT_FOUND
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
            attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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

    async updateUser(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true }
        });
        if (!user) {
            this.logger.warn('User not found');
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
        await user.update(updates);
        return user;
    }

    async updateUserAvatar(updates: Partial<User>, image: any) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true },
            attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
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
        } else {
            return { message: "User deleted successfully", statusCode: HttpStatus.OK };
        }
    }

    async activate(activationLink: string) {
        try {
            console.log("activationLink: ", activationLink)
            const user = await this.usersRepository.findOne({
                    where: { activationLink, isActivated: false },
                });
            if (!user) {
                this.logger.warn('Activation link not found!');
                throw new HttpException("Activation code not found!", HttpStatus.NOT_FOUND);
            }
            user.isActivated = true;
            await user.save();
            return user;

        } catch (e) {
            this.logger.warn('Activation error!', e);
            throw new HttpException("Activation error", HttpStatus.NOT_FOUND);

        }
    }

    async resetPassword(resetPasswordLink: string) {
        const user = await this.usersRepository.findOne({ where: { resetPasswordLink } });
        if (!user) {
            this.logger.warn('Reset password not found!');
            throw new HttpException("Reset password link not found!", HttpStatus.NOT_FOUND);
        }
        return user;
    }

    async updateUserPassword(dto: UpdatePasswordDto) {
        if (!dto.resetPasswordLink || !dto.password) {
            this.logger.warn('Reset password link not found!');
            throw new HttpException("Reset password link not found!", HttpStatus.NOT_FOUND);
        }
        const user = await this.usersRepository.findOne(
            {
                where:
                    { resetPasswordLink: dto.resetPasswordLink }
            });
        if (!user) {
            this.logger.warn('User for reset password not found!');
            throw new HttpException("Reset password link user not found!", HttpStatus.NOT_FOUND);
        }
        const hashPassword = await bcrypt.hash(dto.password, 5);

        user.password = hashPassword;
        await user.save();
        return user;
    }

    async getUserByTelegramId(telegramId: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { telegramId, isActivated: true },
                include: { all: true }
            });

            if(!user) {
                this.logger.warn("User not found by TelegramId")
                throw new UnauthorizedException({ message: "Authorization Error"});
            }
            return user;

        } catch (e) {
            this.logger.warn("User not found by TelegramId", e)
            throw new UnauthorizedException({ message: "Authorization Error"});
        }
    }

    async getCandidateByTelegramId(telegramId: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { telegramId },
                include: { all: true }
            });
            return user;

        } catch (e) {
            this.logger.warn("User not found by TelegramId", e)
            throw new UnauthorizedException({ message: "Authorization Error"});
        }
    }

}
