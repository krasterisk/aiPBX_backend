import {IsNumber, IsString} from "class-validator";

export class QueueDto {
    @IsString({message: "Must be a string"})
    readonly name: string
    @IsString({message: "Must be a string"})
    readonly strategy: 'ringall' | 'leastrecent' | 'fewestcalls' | 'random' | 'rrmemory' | 'linear' | 'wrandom' | 'rrordered'
    @IsNumber({},{message: "Must be integer"})
    readonly vpbx_user_id: number
}