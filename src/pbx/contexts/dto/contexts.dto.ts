import {IsNumber, IsString} from "class-validator";

export class ContextsDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly description: string
    @IsNumber({},{message: 'Must be a number'})
    readonly vpbx_user_id: number

}
