import {IsString} from "class-validator";

export class ExtensionDto {
    @IsString({message: 'Must be a string'})
    readonly exten: string
}