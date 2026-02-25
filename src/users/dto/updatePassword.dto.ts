import {ApiProperty} from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class UpdatePasswordDto {
  @ApiProperty({example: '1234-123123-123123-123123', description: "Reset password link"})
  @IsString({message: 'Must be a string!'})
  readonly resetPasswordLink: string
  @ApiProperty({example: '12345', description: "Password"})
  @IsString({message: 'Must be a string'})
  @Length(5, 50, {message: 'от 5 до 50 символов'})
  readonly password: string
}
