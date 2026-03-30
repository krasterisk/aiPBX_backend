import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Length } from "class-validator";

export class CreateSubUserDto {
    @ApiProperty({ example: 'user@domain.com', description: "Sub-user e-mail address" })
    @IsString({ message: 'Must be a string' })
    @IsEmail({}, { message: 'Incorrect email' })
    readonly email: string;

    @ApiProperty({ example: 'Ivan', description: "Sub-user name", required: false })
    @IsOptional()
    @IsString({ message: 'Must be a string' })
    readonly name?: string;

    @ApiProperty({ example: '12345678', description: "Sub-user password", required: false })
    @IsOptional()
    @IsString({ message: 'Must be a string!' })
    @Length(8, 50, { message: 'The password must contain from 8 to 50 characters.' })
    readonly password?: string;
}
