import {IsNumber, IsString} from "class-validator";

export class ContextsDto {
    @IsNumber({},{message: 'Должно быть число'})
    readonly id: number
    @IsString({message: 'Должно быть строкой'})
    readonly name: string
    @IsString({message: 'Должно быть строкой'})
    readonly description: string
}