import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEmail, IsNumber, IsPositive, IsString } from "class-validator";

export class CreateUserLimitDto {
    @ApiProperty({ example: '1', description: 'User ID' })
    @IsString()
    userId: string;

    @ApiProperty({ example: 100, description: 'Limit amount' })
    @IsNumber()
    @IsPositive()
    limitAmount: number;

    @ApiProperty({ example: ['test@example.com'], description: 'List of emails' })
    @IsArray()
    @IsEmail({}, { each: true })
    emails: string[];
}
