import {IsNumber, IsString} from "class-validator";

export class AppDto {
    @IsString({message: 'Должно быть строкой'})
    readonly name: string
    @IsString({message: 'Должно быть строкой'})
    readonly filename: string
    @IsNumber({}, {message: 'Обязательное поле. Должно быть число'})
    readonly vpbx_user_id: number
}
