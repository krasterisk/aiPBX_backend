import {
    Body,
    Controller,
    Delete,
    Get, HttpException, HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors, UsePipes
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { User } from "./users.model";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AddRoleDto } from "./dto/add-role.dto";
import { AuthService } from "../auth/auth.service";
import { GetUsersDto } from "./dto/getUsers.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { ValidationPipe } from "../pipes/validation.pipe";
import { CreateUserLimitDto } from "./dto/create-user-limit.dto";
import { CreateSubUserDto } from "./dto/create-sub-user.dto";
import { UserLimits } from "./user-limits.model";
import { AdminTopUpDto } from "./dto/admin-top-up.dto";
import { LoggerService } from "../logger/logger.service";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {

    constructor(private userService: UsersService,
        private authService: AuthService,
        private loggerService: LoggerService) { }

    @ApiOperation({ summary: "Admin: top up user balance" })
    @ApiResponse({ status: 200, description: 'Balance topped up successfully' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('admin/top-up')
    @UsePipes(ValidationPipe)
    adminTopUp(@Body() dto: AdminTopUpDto) {
        return this.userService.adminTopUpBalance(dto);
    }

    @ApiOperation({ summary: "Create user" })
    @ApiResponse({ status: 200, type: User })
    //    @UsePipes(ValidationPipe)
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post()
    async create(@Body() dto: CreateUserDto, @Req() request: RequestWithUser) {
        // Sub-users не могут создавать пользователей
        if (request.vpbxUserId) {
            throw new HttpException('Sub-users cannot create users', HttpStatus.FORBIDDEN);
        }
        const activatedDto = { ...dto, isActivated: true, vpbx_user_id: Number(request.tokenUserId) }
        const result = await this.authService.create(activatedDto)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'create', 'user', null, `Created user ${dto.email || dto.username}`, null, null, request);
        return result;
    }

    @ApiOperation({ summary: "Create sub-user" })
    @ApiResponse({ status: 201, type: User })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('sub-user')
    @UsePipes(ValidationPipe)
    async createSubUser(@Body() dto: CreateSubUserDto, @Req() request: RequestWithUser) {
        const ownerUserId = Number(request.vpbxUserId || request.tokenUserId);
        const result = await this.userService.createSubUser(ownerUserId, dto);
        await this.loggerService.logAction(ownerUserId, 'create', 'sub-user', result.id, `Created sub-user ${dto.email}`, null, null, request);
        return result;
    }

    @ApiOperation({ summary: "Get sub-users of current owner" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('sub-users')
    getSubUsers(@Req() request: RequestWithUser) {
        const ownerUserId = Number(request.vpbxUserId || request.tokenUserId);
        return this.userService.getSubUsers(ownerUserId);
    }

    @ApiOperation({ summary: "Get users by page" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('page')
    get(@Query() query: GetUsersDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.userService.get(query, isAdmin, userId)
    }

    @ApiOperation({ summary: "Get user balance" })
    @ApiResponse({ status: 200, type: String })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('balance')
    getBalance(@Req() request: RequestWithUser) {
        const userId = request.vpbxUserId || request.tokenUserId
        return this.userService.getUserBalance(userId)
    }

    @ApiOperation({ summary: "Get user data" })
    @ApiResponse({ status: 200, type: User })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('me')
    getMe(@Req() request: RequestWithUser) {
        const userId = request.tokenUserId
        console.log("USER ME: ", userId)
        return this.userService.getMe(userId)
    }

    @ApiOperation({ summary: "Get all users" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.userService.getAllUsers()
    }

    @ApiOperation({ summary: "Get profile" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/profile')
    getUserProfile() {
        return this.userService.getUserProfile()
    }

    @ApiOperation({ summary: "Update profile" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch('/profile')
    updateUserProfile(@Body() updates: Partial<User>) {
        return this.userService.updateUserProfile(updates)
    }

    @ApiOperation({ summary: "Update User" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch()
    updateUser(@Body() updates: Partial<User>) {
        return this.userService.updateUser(updates)
    }

    @ApiOperation({ summary: "Get user by id" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenId = request.tokenUserId
        return this.userService.getUserById(id, tokenId, isAdmin)
    }

    @ApiOperation({ summary: "Get profile by id" })
    @ApiResponse({ status: 200, type: [User] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/profile/:id')
    getProfileById(@Param('id') id: number,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenId = request.tokenUserId
        return this.userService.getUserById(id, tokenId, isAdmin)
    }

    @ApiOperation({ summary: "Add role for user" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/add')
    addRole(@Body() dto: AddRoleDto) {
        return this.userService.addRole(dto)
    }

    @ApiOperation({ summary: "Remove user's role" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('/role/remove')
    removeRole(@Body() dto: AddRoleDto) {
        return this.userService.removeRole(dto)
    }

    @ApiOperation({ summary: "Edit user" })
    @ApiResponse({ status: 200, type: User })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    async UpdateUser(@Body() updates: Partial<User>, @Req() request: RequestWithUser) {
        const result = await this.userService.updateUser(updates)
        const userId = request.vpbxUserId || request.tokenUserId;
        await this.loggerService.logAction(Number(userId), 'update', 'user', (updates as any).id, `Admin updated user`, null, updates, request);
        return result;
    }

    @ApiOperation({ summary: "Upload user avatar" })
    @ApiResponse({ status: 200, type: User })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch('/avatar')
    @UseInterceptors(FileInterceptor('image'))

    UpdateUserAvatar(@Body() updates: Partial<User>,
        @UploadedFile() image) {
        return this.userService.updateUserAvatar(updates, image)
    }


    @ApiOperation({ summary: "Delete user by id's" })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    async DeleteUser(@Param('id') id: number, @Req() request: RequestWithUser) {
        const requesterId = Number(request.vpbxUserId || request.tokenUserId);
        const result = await this.userService.deleteUser(id, request.isAdmin ? undefined : requesterId)
        await this.loggerService.logAction(requesterId, 'delete', 'user', id, `Deleted user #${id}`, null, null, request);
        return result;
    }

    @ApiOperation({ summary: "Set user usage limit" })
    @ApiResponse({ status: 200, type: UserLimits })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Post('/limits')
    @UsePipes(ValidationPipe)
    setUsageLimit(@Body() dto: CreateUserLimitDto, @Req() request: RequestWithUser) {
        let userId = Number(dto.userId);
        const tokenUserId = Number(request.tokenUserId);

        if (!request.isAdmin) {
            userId = tokenUserId;
        }
        (dto as any).userId = userId;
        return this.userService.setUsageLimit(dto);
    }

    @ApiOperation({ summary: "Get user usage limit" })
    @ApiResponse({ status: 200, type: UserLimits })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/limits/:userId')
    getUsageLimit(@Param('userId') userId: string, @Req() request: RequestWithUser) {
        const tokenUserId = Number(request.tokenUserId);
        const requestedUserId = Number(userId);
        const isAdmin = request.isAdmin;

        if (!isAdmin && tokenUserId !== requestedUserId) {
            throw new HttpException("Forbidden", HttpStatus.FORBIDDEN);
        }

        return this.userService.getUsageLimit(requestedUserId);
    }
}
