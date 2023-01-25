import {IsNumber, IsString} from "class-validator";

export class TimegroupDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly timecondition: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpb_user_id: number
}