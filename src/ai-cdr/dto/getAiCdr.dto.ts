import { IsString, IsOptional, IsIn } from "class-validator";

export class GetAiCdrDto {
    @IsString({ message: 'Must be a string!' })
    userId: string = '0'
    @IsString({ message: 'Must be a string!' })
    search?: string
    assistantId?: string
    startDate?: string
    endDate?: string
    page: number | string = 1
    limit: number | string = 10

    @IsOptional()
    @IsIn(['createdAt', 'callerId', 'assistantName', 'tokens', 'cost', 'duration', 'csat', 'scenarioSuccess'], {
        message: 'sortField must be one of: createdAt, callerId, assistantName, tokens, cost, duration, csat, scenarioSuccess'
    })
    sortField?: string

    @IsOptional()
    @IsIn(['ASC', 'DESC'], { message: 'sortOrder must be ASC or DESC' })
    sortOrder?: 'ASC' | 'DESC'
}
