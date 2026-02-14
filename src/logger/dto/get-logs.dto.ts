import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetLogsDto {
    @ApiPropertyOptional({ example: '1' })
    @IsOptional()
    page?: number | string = 1;

    @ApiPropertyOptional({ example: '25' })
    @IsOptional()
    limit?: number | string = 25;

    @ApiPropertyOptional({ example: 'login' })
    @IsOptional()
    @IsString()
    search?: string = '';

    @ApiPropertyOptional({ example: 'create' })
    @IsOptional()
    @IsString()
    action?: string;

    @ApiPropertyOptional({ example: 'assistant' })
    @IsOptional()
    @IsString()
    entity?: string;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional()
    @IsString()
    startDate?: string;

    @ApiPropertyOptional({ example: '2026-12-31' })
    @IsOptional()
    @IsString()
    endDate?: string;

    @ApiPropertyOptional({ example: '0' })
    @IsOptional()
    @IsString()
    userId?: string;
}
