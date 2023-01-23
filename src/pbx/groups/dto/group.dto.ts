import {IsNumber, IsString} from "class-validator";


export class GroupDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsNumber({},{message: 'Must be integer'})
    readonly timeout: number
    @IsString({message: 'Must be a string'})
    readonly endpoints: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpb_user_id: number
}