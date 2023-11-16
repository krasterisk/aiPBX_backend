import {IsNumber, IsString} from "class-validator";

export class EndpointsDto {
    @IsString({message: 'Должно быть строкой'})
    readonly id: number
    @IsString({message: 'Должно быть строкой'})
    readonly endpoint_id: string
    @IsString({message: 'Должно быть строкой'})
    readonly username: string
    @IsString({message: 'Должно быть строкой'})
    readonly password: string
    @IsString({message: 'Обязательное поле. Должно быть строкой'})
    readonly context: string
    @IsString({message: 'Обязательное поле. Используемый транспортый протокол'})
    readonly transport: string
    @IsString({message: 'Обязательное поле. Используемые кодеке'})
    readonly allow: string
    @IsNumber({allowInfinity: false, allowNaN: false},{message: 'Ограничение на количество регистраций. Целое число'})
    readonly max_contacts: number
    @IsString({message: 'Тип авторизации'})
    readonly auth_type: string
    @IsNumber({},{message: 'Обязательное поле. Целое число'})
    readonly vpbx_user_id: number
}
