import {IsString} from "class-validator";

export class ActivationDto {
    @IsString({message: 'Must be a string'})
    activationCode: string
}
