import {Body, Controller, Delete, Get, Param, Post, Put, UseGuards} from '@nestjs/common';
import {UsersService} from "./users.service";
import {CreateUserDto} from "./dto/create-user.dto";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {User} from "./users.model";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {AddRoleDto} from "./dto/add-role.dto";
import {BanUserDto} from "./dto/ban-user.dto";
import {AuthService} from "../auth/auth.service";

@ApiTags('Users')
@Controller('users')
export class UsersController {

    constructor(private userService: UsersService,
                private authService: AuthService) {}

    @ApiOperation({summary: "Create user"})
    @ApiResponse({status: 200, type: User})
//    @UsePipes(ValidationPipe)
//     @Roles('ADMIN')
//     @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreateUserDto) {
        return this.authService.registration(dto)
    }

    @ApiOperation({summary: "Get all users"})
    @ApiResponse({status: 200, type: [User]})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.userService.getAllUsers()
    }

    @ApiOperation({summary: "Get profile"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/profile')
    getUserProfile() {
        return this.userService.getUserProfile()
    }

    @ApiOperation({summary: "Update"})
    @ApiResponse({status: 200, type: [User]})
//    @Roles('ADMIN')
//    @UseGuards(RolesGuard)
    @Put('/profile')
    updateUserProfile(@Body() updates: Partial<User>) {
        return this.userService.updateUserProfile(updates)
    }

    @ApiOperation({summary: "Get user by id"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.userService.getUserById(id)
    }

    @ApiOperation({summary: "Get profile by id"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/profile/:id')
    getProfileById(@Param('id') id: number) {
        return this.userService.getUserById(id)
    }


    @ApiOperation({summary: "Add role for user"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/add')
    addRole(@Body() dto: AddRoleDto) {
        return this.userService.addRole(dto)
    }

    @ApiOperation({summary: "Remove user's role"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/remove')
    removeRole(@Body() dto: AddRoleDto) {
        return this.userService.removeRole(dto)
    }

    @ApiOperation({summary: "Ban user"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/ban')
    banUser(@Body() dto: BanUserDto) {
        return this.userService.banUser(dto)
    }

    @ApiOperation({summary: "Edit user"})
    @ApiResponse({status: 200, type: User})
    // @Roles('ADMIN')
    // @UseGuards(RolesGuard)
    @Put()
    UpdateUser(@Body() updates: Partial<User>) {
        return this.userService.updateUser(updates)
    }

    @ApiOperation({summary: "Delete user by id's"})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    DeleteUser(@Body() body: {ids: number[]}) {
        const { ids } = body
        return this.userService.deleteUser(ids)
    }


}
