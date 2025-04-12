import {
    Body,
    Controller,
    Delete,
    Get, HttpException, HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query, Redirect,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors, UsePipes
} from "@nestjs/common";
import {UsersService} from "./users.service";
import {CreateUserDto} from "./dto/create-user.dto";
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {User} from "./users.model";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {AddRoleDto} from "./dto/add-role.dto";
import {AuthService} from "../auth/auth.service";
import {GetUsersDto} from "./dto/getUsers.dto";
import {FileInterceptor} from "@nestjs/platform-express";
import { ValidationPipe } from "../pipes/validation.pipe";
import { ResetPasswordDto } from "./dto/resetPassword.dto";
import { UpdatePasswordDto } from "./dto/updatePassword.dto";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {

    constructor(private userService: UsersService,
                private authService: AuthService) {}


    @Get('/activate/:link')
    @Redirect('', 302)
    activate(@Param('link') link: string) {
        const user = this.userService.activate(link)
        if(!user) {
            throw new HttpException('Activation error!', HttpStatus.BAD_REQUEST)
        }
        // console.log(user)
        return { url: `${process.env.CLIENT_URL}/activated` }
    }

    @Get('/resetPassword/:link')
    @Redirect('', 302)
    resetPassword(@Param('link') link: string) {
        const user = this.userService.resetPassword(link)
        if(!user) {
            throw new HttpException('Reset Password error!', HttpStatus.BAD_REQUEST)
        }
        // console.log(user)
        return { url: `${process.env.CLIENT_URL}/resetPassword/${link}` }
    }

    @ApiOperation({summary: "forgot user password"})
    @ApiResponse({status: 200, type: User})
    @UsePipes(ValidationPipe)
//     @Roles('ADMIN')
//     @UseGuards(RolesGuard)
    @Post('forgotPassword')
    forgotPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.forgotPassword(dto)
    }

    @ApiOperation({summary: "Create user"})
    @ApiResponse({status: 200, type: User})
//    @UsePipes(ValidationPipe)
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreateUserDto) {
        const activatedDto = {...dto, isActivated: true}
        return this.authService.create(activatedDto)
    }

    @ApiOperation({summary: "Create user"})
    @ApiResponse({status: 200, type: User})
    @UsePipes(ValidationPipe)
//     @Roles('ADMIN')
//     @UseGuards(RolesGuard)
    @Post('register')
    register(@Body() dto: CreateUserDto) {
        return this.authService.registration(dto)
    }

    @ApiOperation({summary: "Get users by page"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('page')
    get(@Query() query: GetUsersDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.userService.get(query,isAdmin,userId)
    }

    @ApiOperation({summary: "Get all users"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.userService.getAllUsers()
    }

    @ApiOperation({summary: "Get profile"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/profile')
    getUserProfile() {
        return this.userService.getUserProfile()
    }

    @ApiOperation({summary: "Update profile"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Patch('/profile')
    updateUserProfile(@Body() updates: Partial<User>) {
        return this.userService.updateUserProfile(updates)
    }

    @ApiOperation({summary: "Update User"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Patch()
    updateUser(@Body() updates: Partial<User>) {
        return this.userService.updateUser(updates)
    }

    @ApiOperation({summary: "Get user by id"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number,
           @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenId = request.tokenUserId
        return this.userService.getUserById(id,tokenId,isAdmin)
    }

    @ApiOperation({summary: "Get profile by id"})
    @ApiResponse({status: 200, type: [User]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/profile/:id')
    getProfileById(@Param('id') id: number,
                   @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenId = request.tokenUserId
        return this.userService.getUserById(id,tokenId,isAdmin)
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

    @ApiOperation({summary: "Edit user"})
    @ApiResponse({status: 200, type: User})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    UpdateUser(@Body() updates: Partial<User>) {
        return this.userService.updateUser(updates)
    }

    @ApiOperation({summary: "Upload user avatar"})
    @ApiResponse({status: 200, type: User})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Patch('/avatar')
    @UseInterceptors(FileInterceptor('image'))

    UpdateUserAvatar(@Body() updates: Partial<User>,
                     @UploadedFile() image) {
        return this.userService.updateUserAvatar(updates, image)
    }


    @ApiOperation({summary: "Delete user by id's"})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    DeleteUser(@Param('id') id: number) {
        return this.userService.deleteUser(id)
    }

    @ApiOperation({summary: "Update user password"})
    @ApiResponse({status: 200, type: User})
    // @Roles('ADMIN')
    // @UseGuards(RolesGuard)
    @Post('/updatePassword')
    UpdateUserPassword(@Body() updatePassword: UpdatePasswordDto) {
        return this.userService.updateUserPassword(updatePassword)
    }

}
