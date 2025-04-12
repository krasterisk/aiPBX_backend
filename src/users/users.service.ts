import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
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
            await this.usersRepository.destroy({ where: { username: dto.username } });
            throw new HttpException({ message: "[User] Role not found" }, HttpStatus.NOT_FOUND);

        } catch (e) {
            await this.usersRepository.destroy({ where: { username: dto.username } });
            throw new HttpException({ message: e + "[User] Role not found" }, HttpStatus.NOT_FOUND);

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
                    order: [
                        [sort, order]
                    ],
                    where:
                        {
                            [sequelize.Op.and]: [
                                {
                                    [sequelize.Op.or]: [
                                        {
                                            username: {
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
            throw new HttpException({ message: "[Users]:  Request error" } + e, HttpStatus.BAD_REQUEST);
        }
    }


    async getUserByEmail(email: string) {
        const user = await this.usersRepository.findOne({
            where: { email },
            include: { all: true },
            attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
        });
        return user;
    }

    async getUserProfile() {
        try {
            const user = await this.usersRepository.findAll({
                include: { all: true },
                attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
            });
            return user[0];
        } catch (e) {
            throw new HttpException("Users not found" + e, HttpStatus.NOT_FOUND);
        }
    }

    async updateUserProfile(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true },
            attributes: { exclude: ["password", "activationLink", "resetPasswordLink"] }
        });
        if (!user) {
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }
        await user.update(updates);
        return user;
    }

    async getUserByUsername(username: string) {
        try {
            const user = await this.usersRepository.findOne({
                where: { username, isActivated: true },
                include: { all: true }
            });
            return user;

        } catch (e) {
            throw new HttpException("User not found" + e, HttpStatus.NOT_FOUND);
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
                throw new HttpException(
                    "[USER] Editing Forbidden", HttpStatus.NOT_FOUND
                );
            }
            return user;
        } catch (e) {
            throw new HttpException(
                "[USER] User not found" + e, HttpStatus.NOT_FOUND
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
        throw new HttpException("User or Role not found", HttpStatus.NOT_FOUND);
    }

    async updateUser(updates: Partial<User>) {
        const user = await this.usersRepository.findByPk(updates.id, {
            include: { all: true }
        });
        if (!user) {
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
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        }

        const filename = await this.fileService.createFile(image);

        await user.update({ ...updates, avatar: filename });
        return user;
    }


    async deleteUser(id: number) {
        const deleted = await this.usersRepository.destroy({ where: { id } });
        if (deleted === 0) {
            throw new HttpException("User not found", HttpStatus.NOT_FOUND);
        } else {
            return { message: "User deleted successfully", statusCode: HttpStatus.OK };
        }
    }

    async activate(activationLink: string) {
        const user = await this.usersRepository.findOne({ where: { activationLink } });
        if (!user) {
            throw new HttpException("Activation link not found!", HttpStatus.NOT_FOUND);
        }
        user.isActivated = true;
        await user.save();
        return user;
    }

    async resetPassword(resetPasswordLink: string) {
        const user = await this.usersRepository.findOne({ where: { resetPasswordLink } });
        if (!user) {
            throw new HttpException("Reset password link not found!", HttpStatus.NOT_FOUND);
        }
        return user;
    }

    async updateUserPassword(dto: UpdatePasswordDto) {
        if (!dto.resetPasswordLink || !dto.password) {
            throw new HttpException("[User] Reset password link not found!", HttpStatus.NOT_FOUND);
        }
        const user = await this.usersRepository.findOne(
            {
                where:
                    { resetPasswordLink: dto.resetPasswordLink }
            });
        if (!user) {
            throw new HttpException("[User] Reset password link user not found!", HttpStatus.NOT_FOUND);
        }
        const hashPassword = await bcrypt.hash(dto.password, 5);
        console.log(hashPassword);
        user.password = hashPassword;
        await user.save();
        return user;
    }

}
