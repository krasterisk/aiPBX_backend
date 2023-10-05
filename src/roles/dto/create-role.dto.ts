import {IsString} from "class-validator";
import {ApiProperty} from "@nestjs/swagger";

export class CreateRoleDto {
    @ApiProperty({example: 'USER', description: "Role's name"})
    @IsString({message: 'Must be a string!'})
    readonly value: string
    @ApiProperty({example: 'Simple user', description: "Role's description"})
    @IsString({message: 'Must be a string!'})
    readonly description: string
}
