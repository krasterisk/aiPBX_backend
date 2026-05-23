import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches } from 'class-validator';

function toBool(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    return undefined;
}

export class RunClosingDocumentsDto {
    @ApiPropertyOptional({ description: 'Organization id (required unless dryRun + confirmAll)' })
    @Transform(({ value }) => (value != null ? Number(value) : undefined))
    @IsInt()
    @IsOptional()
    organizationId?: number;

    @ApiPropertyOptional({ example: '2026-04-01' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsOptional()
    periodFrom?: string;

    @ApiPropertyOptional({ example: '2026-04-30' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsOptional()
    periodTo?: string;

    @ApiPropertyOptional({ example: '2026-05-01' })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/)
    @IsOptional()
    documentDate?: string;

    @ApiPropertyOptional({ default: false })
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    @IsOptional()
    sendViaEdo?: boolean;

    @ApiPropertyOptional({ default: false })
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    @IsOptional()
    dryRun?: boolean;

    @ApiPropertyOptional({ description: 'Run for all orgs (only with dryRun or explicit confirm)' })
    @Transform(({ value }) => toBool(value))
    @IsBoolean()
    @IsOptional()
    confirmAll?: boolean;
}
