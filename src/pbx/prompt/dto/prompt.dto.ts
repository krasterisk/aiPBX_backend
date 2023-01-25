import {
    IsArray,
    IsNumber,
    IsString,
} from "class-validator";
import {PromptFileName} from "../prompt.model";

export class PromptDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsArray({message: 'Must be object'})
    readonly filenames: PromptFileName[]
    @IsNumber({},{message: "Must be integer"})
    readonly vpbx_user_id: number
}