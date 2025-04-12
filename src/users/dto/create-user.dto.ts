import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsString, Length} from "class-validator";
import {CreateRoleDto} from "../../roles/dto/create-role.dto";

export class CreateUserDto {
    @ApiProperty({example: 'name', description: "Наименование клиента"})
    @IsString({message: 'Must be a string!'})
    @Length(3,40, {message: 'от 5 до 40 знаков'})
    readonly name: string
    @ApiProperty({example: 'Username', description: "Username"})
    @IsString({message: 'Must be a string!'})
    @Length(3,25, {message: 'от 5 до 25 знаков'})
    readonly username: string
    @ApiProperty({example: 'user@domain.com', description: "E-mail address"})
    @IsString({message: 'Must be a string'})
    @IsEmail({},{message: 'Некорректный email'})
    readonly email?: string
    @ApiProperty({example: '1234-1234-1234-1234', description: "activation link"})
    // @IsString({message: 'Must be a string'})
    readonly activationLink?: string
    @ApiProperty({example: '12345', description: "Password"})
    @IsString({message: 'Must be a string!'})
    @Length(5, 25, {message: 'от 5 до 25 символов'})
    readonly password: string
    @ApiProperty({example: 'USER', description: "Role"})
    // @IsString({message: 'Must be a array of Roles'})
    readonly roles?: CreateRoleDto[]
}
