import {IsString} from "class-validator";

export class getRatingDto {
    @IsString({message: 'Must be a string'})
    readonly postId: number
    @IsString({message: 'Must be a string'})
    readonly userId: number
}
