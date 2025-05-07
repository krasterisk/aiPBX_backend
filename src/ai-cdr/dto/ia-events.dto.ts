import {IsNumber, IsObject, IsString} from "class-validator";

export class AiEventDto {
    @IsString({message: 'Must be a string'})
    channelId: string
    @IsString({message: 'Must be a string'})
    callerId: string
    @IsNumber({},{message: 'Must be a string'})
    userId?: number
    @IsObject({message: 'Must be object'})
    events?: Record<string, any>[]
    @IsNumber({}, {message: 'Must be a string'})
    vPbxUserId?: number
}
