import {IsString} from "class-validator";

export class GetAiCdrDto {
    @IsString({message: 'Must be a string!'})
    userId: string = '0'
    @IsString({message: 'Must be a string!'})
    search?: string
    assistantId?: string
    startDate?: string
    endDate?: string
    page: number | string = 1
    limit: number | string = 10
}
