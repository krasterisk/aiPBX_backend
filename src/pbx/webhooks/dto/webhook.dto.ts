import {IsNumber, IsString} from "class-validator";

export class WebhookDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be a string'})
    readonly events: string[]
    @IsNumber({},{message: "Must be integer"})
    readonly vpb_user_id: number
}