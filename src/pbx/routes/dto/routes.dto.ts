import {IsNumber, IsString} from "class-validator";

export class RoutesDto {
    @IsString({message: 'Должно быть строкой'})
    readonly name: string
    @IsString({message: 'Должно быть строкой'})
    readonly vpbx_user_id: number

}