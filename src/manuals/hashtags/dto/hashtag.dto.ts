import {IsNumber, IsString} from "class-validator";

export class HashtagDto {
    @IsString({message: 'Must be a string'})
    readonly title: string
    @IsNumber({},{message: 'Must be a number'})
    readonly postId: number
}
