import {IsNumber, IsString} from "class-validator";


export class IvrDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpb_user_id: number
}