import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsString, Length} from "class-validator";
import {CreateRoleDto} from "../../roles/dto/create-role.dto";

export class CreateUserDto {
    @ApiProperty({example: 'name', description: "Customer name"})
    // @IsString({message: 'Must be a string!'})
    // @Length(3,40, {message: 'The name must contain from 5 to 40 characters.'})
    readonly name?: string
    @ApiProperty({example: 'Username', description: "Username"})
    // @IsString({message: 'Must be a string!'})
    // @Length(3,25, {message: 'The username must contain from 3 to 25 characters.'})
    readonly username?: string
    @ApiProperty({example: 'user@domain.com', description: "E-mail address"})
    @IsString({message: 'Must be a string'})
    @IsEmail({},{message: 'Incorrect email'})
    readonly email: string
    @ApiProperty({example: 'avatar.png', description: "User avatar"})
    @IsString({message: 'Must be a string'})
    readonly avatar?: string
    @ApiProperty({example: '123', description: "GoogleId for google auth"})
    @IsString({message: 'Must be a string'})
    readonly googleId?: string
    @ApiProperty({example: '1234-1234-1234-1234', description: "activation link"})
    // @IsString({message: 'Must be a string'})
    readonly activationLink?: string
    @ApiProperty({example: '12345', description: "Password"})
    @IsString({message: 'Must be a string!'})
    @Length(8, 50, {message: 'The password must contain from 8 to 50 characters.'})
    readonly password: string
    @ApiProperty({example: 'USER', description: "Role"})
    // @IsString({message: 'Must be a array of Roles'})
    readonly roles?: CreateRoleDto[]
}
