import { IsNumber, IsString} from "class-validator";

export class WebhookDto {
    @IsString({message: 'Must be a string'})
    readonly name: string
    @IsString({message: 'Must be string'})
    readonly events: string
    @IsNumber({},{message: "Must be integer"})
    readonly vpbx_user_id: number
}