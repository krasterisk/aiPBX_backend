import { IsNumber, IsOptional, IsString } from "class-validator";

export class AiCdrDto {
    @IsString({ message: 'Must be a string' })
    channelId: string
    @IsString({ message: 'Must be a string' })
    callerId: string
    @IsNumber({}, { message: 'Must be a string' })
    userId?: number
    @IsNumber({}, { message: 'Must be a string' })
    tokens?: number
    @IsString({ message: 'Must be a string' })
    assistantId: string
    @IsString({ message: 'Must be a string' })
    assistantName: string
    @IsNumber({}, { message: 'Must be a string' })
    vPbxUserId?: number
    @IsOptional()
    @IsString({ message: 'Must be a string' })
    source?: string
}
