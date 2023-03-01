import {ApiProperty} from "@nestjs/swagger";
import {IsString, Length} from "class-validator";

export class CreateUserDto {
    @ApiProperty({example: 'Username', description: "Username"})
    @IsString({message: 'Must be a string!'})
    @Length(3,20, {message: 'from 3 to 20 characters!'})
    readonly username: string
    @ApiProperty({example: 'user@domain.com', description: "E-mail address"})
//    @IsString({message: 'Must be a string'})
//    @IsEmail({},{message: 'Incorrect email!'})
    readonly email?: string
    @ApiProperty({example: '12345', description: "Password"})
    @IsString({message: 'Must be a string!'})
    @Length(3, 50, {message: 'from 3 to 50 characters'})
    readonly password: string
}
