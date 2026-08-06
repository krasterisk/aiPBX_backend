import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsNumber,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomMetricDef } from '../interfaces/operator-metrics.interface';

export class AnalyzeBase64FileDto {
    @ApiPropertyOptional({ description: 'Raw Base64 or data:audio/...;base64,...' })
    @IsString()
    data: string;

    @ApiPropertyOptional({ example: 'call.mp3' })
    @IsString()
    @MaxLength(255)
    filename: string;
}

export class AnalyzeRequestDto {
    @ApiPropertyOptional({ description: 'Single audio URL (server downloads)' })
    @IsOptional()
    @IsString()
    url?: string;

    @ApiPropertyOptional({ description: 'Batch of audio URLs', type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    urls?: string[];

    @ApiPropertyOptional({
        description: 'Single Base64 audio payload (raw or data-URI). Requires filename.',
    })
    @IsOptional()
    @IsString()
    file?: string;

    @ApiPropertyOptional({ description: 'Filename for single `file` field', example: 'call.mp3' })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    filename?: string;

    @ApiPropertyOptional({ type: [AnalyzeBase64FileDto] })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AnalyzeBase64FileDto)
    files?: AnalyzeBase64FileDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    operatorName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    clientPhone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    language?: string;

    @ApiPropertyOptional({ type: 'array' })
    @IsOptional()
    @IsArray()
    customMetrics?: CustomMetricDef[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    provider?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    projectId?: number;

    @ApiPropertyOptional({ description: 'Wait for analysis (single item only)' })
    @IsOptional()
    sync?: boolean | string;

    @ApiPropertyOptional()
    @IsOptional()
    consentObtained?: boolean | string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    consentSource?: string;
}
