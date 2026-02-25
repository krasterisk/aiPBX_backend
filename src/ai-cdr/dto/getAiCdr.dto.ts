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

    projectId?: number | string

    @IsOptional()
    @IsString()
    source?: string

    @IsOptional()
    @IsString()
    sortField?: string

    @IsOptional()
    @IsIn(['ASC', 'DESC'], { message: 'sortOrder must be ASC or DESC' })
    sortOrder?: 'ASC' | 'DESC'
}
