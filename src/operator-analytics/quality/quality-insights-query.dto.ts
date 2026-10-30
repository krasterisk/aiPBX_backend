import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsTimeZone } from 'class-validator';
import { QualityReadQueryDto } from './quality-read-query.dto';

export class QualityInsightsQueryDto extends QualityReadQueryDto {
    @ApiPropertyOptional() @IsOptional() @IsTimeZone() timezone?: string;
    @ApiPropertyOptional() @IsOptional() @IsIn(['1', '0', 'true', 'false']) refresh?: string;
}
