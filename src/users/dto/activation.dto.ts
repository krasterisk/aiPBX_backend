import {IsEmail, IsString} from "class-validator";

export class ActivationDto {
    @IsString({message: 'Must be a string'})
    @IsEmail({},{message: 'Incorrect email'})
    readonly email: string
    @IsString({message: 'Must be a string'})
    readonly activationCode: string
    @IsString({message: 'Must be a string'})
    readonly password: string
}
