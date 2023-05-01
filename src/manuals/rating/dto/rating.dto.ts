import {IsNumber} from "class-validator";

export class RatingDto {
    @IsNumber({},{message: 'Must be a number'})
    readonly rate: number
    @IsNumber({},{message: 'Must be a number'})
    readonly postId: number
    @IsNumber({},{message: 'Must be a number'})
    readonly userId: number
}
