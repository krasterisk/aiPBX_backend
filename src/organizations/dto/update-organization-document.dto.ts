import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

export class UpdateOrganizationDocumentDto {
    @ApiProperty({ required: false, example: 'AI-001' })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    number?: string;

    @ApiProperty({ required: false, example: '2026-07-16', description: 'YYYY-MM-DD' })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'documentDate must be YYYY-MM-DD' })
    documentDate?: string;

    @ApiProperty({ required: false, example: 10000 })
    @IsOptional()
    @ValidateIf((_, v) => v !== undefined && v !== null)
    @IsNumber()
    @Min(0.01)
    amountRub?: number;
}
