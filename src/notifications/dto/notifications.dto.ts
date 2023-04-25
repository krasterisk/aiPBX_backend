import {IsNumber, IsString} from "class-validator";

export class NotificationsDto {
    @IsString({message: 'Must be a string'})
    readonly title: string
    @IsString({message: 'Must be a string'})
    readonly description: string
    @IsNumber({},{message: "Must be integer"})
    readonly userId: number
}
