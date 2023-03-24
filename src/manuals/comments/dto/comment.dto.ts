import {IsNumber, IsString} from "class-validator";

export class CommentDto {
    @IsString({message: 'Must be a string'})
    readonly text: string
    @IsNumber({},{message: 'Must be a number'})
    readonly postId: number
    @IsNumber({},{message: 'Must be a number'})
    readonly userId: number
}
