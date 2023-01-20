import {IsNumber, IsString} from "class-validator";


export class CallbackDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly phones: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpb_user_id: number
}