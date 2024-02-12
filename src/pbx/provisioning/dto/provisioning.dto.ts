import {
    IsNumber,
    IsString,
} from "class-validator";

export class ProvisioningDto {
    @IsString({message: 'Must be a string'})
    readonly vendor: string
    @IsString({message: 'Must be string'})
    readonly filename: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpbx_user_id: number
}
