import {ApiProperty} from "@nestjs/swagger";
import {IsEmail, IsString, Length, isNotEmpty} from "class-validator";

export class ResetPasswordDto {
  @ApiProperty({example: 'user@domain.com', description: "E-mail address"})
  @IsString({message: 'Must be a string'})
  @IsEmail({},{message: 'Некорректный email'})
  readonly email: string
}
