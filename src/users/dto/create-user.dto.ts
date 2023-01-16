import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsNumber, IsString, Length} from "class-validator";

export class CreateUserDto {
    @ApiProperty({example: 'user@domain.com', description: "Адрес эл. почты"})
    @IsString({message: 'должно быть строкой'})
    @IsEmail({},{message: 'Некоректный email'})
    readonly email: string
    @ApiProperty({example: '12345', description: "пароль"})
    @IsString({message: 'должно быть строкой'})
    @Length(3, 16, {message: 'от 3 до 16 символов'})
    readonly password: string
    @ApiProperty({description: "VPBX id"})
    @IsNumber({},{message: 'Обязательное поле. Число'})
    readonly vpbx_user_id: number
}