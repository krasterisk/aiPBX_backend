import {IsNumber, IsString} from "class-validator";

export class ParagraphDto {
    @IsString({message: 'Must be a string'})
    readonly paragraph: string
    @IsNumber({},{message: 'Must be a number'})
    readonly blockTextId: number
}
