import {IsNumber, IsString} from "class-validator";

export class EndpointGroupsDto {
    @IsString({message: 'Must be a number'})
    readonly id: number
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly description: string
    @IsNumber({},{message: 'Must be a number'})
    readonly vpbx_user_id: number
}
