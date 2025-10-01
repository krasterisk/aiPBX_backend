import {IsBoolean, IsNumber, IsString} from "class-validator";

export class ToolDto {
    @IsString({message: 'Must be a string'})
    readonly type: string
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly description: string
    @IsString({message: 'Must be a string'})
    readonly parameters: string;
    @IsBoolean({message: 'Must be a boolean'})
    readonly strict: boolean;
    @IsString({message: 'Must be a string'})
    readonly webhook: string;
    @IsNumber({}, {message: 'Must be a number'})
    userId: number
}
