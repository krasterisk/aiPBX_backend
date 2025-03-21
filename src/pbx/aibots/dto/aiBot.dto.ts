import {IsNumber, IsString} from "class-validator";

export class AiBotDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly instruction: string
    @IsNumber({}, {message: 'Обязательное поле. Должно быть число'})
    readonly vpbx_user_id: number
}
