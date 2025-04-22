import {IsNumber, IsObject, IsString} from "class-validator";

export class AiCdrDto {
    @IsString({message: 'Must be a string'})
    channelId: string
    @IsString({message: 'Must be a string'})
    callerId: string
    @IsObject({message: 'Must be a object'})
    data: object
    @IsNumber({},{message: 'Must be a string'})
    userId?: number
    @IsString({message: 'Must be a string'})
    assistantId: string
    @IsString({message: 'Must be a string'})
    assistantName: string
    @IsNumber({}, {message: 'Must be a string'})
    vPbxUserId?: number
}
