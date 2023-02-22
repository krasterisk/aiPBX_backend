import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsString, Length} from "class-validator";

export class CreateVpbxuserDto {
    @ApiProperty({example: 'Username', description: "Username"})
    @IsString({message: 'Must be a string'})
    @Length(3, 20, {message: 'from 3 to 20 characters'})
    readonly username: string
    @ApiProperty({example: 'user@domain.com', description: "E-mail address"})
    @IsString({message: 'Must be a email'})
    @IsEmail({},{message: 'Incorrect email'})
    readonly email: string
    @ApiProperty({example: '12345', description: "password"})
    @IsString({message: 'Must be a string'})
    @Length(3, 20, {message: '3 to 20 characters'})
    readonly password: string
}
