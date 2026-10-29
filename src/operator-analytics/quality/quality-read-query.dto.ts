import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Shared selection contract for the quality dashboard, drilldowns and evidence. */
export class QualityReadQueryDto {
    @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) projectId?: number;
    @ApiPropertyOptional() @IsOptional() @IsIn(['1', '0', 'true', 'false']) withoutProject?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() startDate?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() endDate?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() sources?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() callTypes?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() people?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() operatorFilters?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() tagIds?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() csat?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['incoming', 'outgoing', 'internal']) callType?: 'incoming' | 'outgoing' | 'internal';
    @ApiPropertyOptional() @IsOptional() @IsString() operatorId?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() operatorName?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() operatorNameExact?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() tagId?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['1', '0', 'true', 'false']) withoutTopic?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['1', '0', 'true', 'false']) withoutOperator?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['positive', 'neutral', 'negative']) sentiment?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['true', 'false']) success?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['1', '0', 'true', 'false']) withoutOutcome?: string;
    @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limit?: number;
    @ApiPropertyOptional() @IsOptional() @IsIn(['id', 'createdAt', 'duration', 'assistantName']) sortField?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['ASC', 'DESC']) sortOrder?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['worst', 'best']) order?: 'worst' | 'best';
    @ApiPropertyOptional() @IsOptional() @IsString() metricId?: string;
    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) evidencePage?: number;
    @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) evidencePageSize?: number;
}
