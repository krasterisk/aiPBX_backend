import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class BackfillFxDto {
    @ApiPropertyOptional({
        example: '1',
        description: 'Only billing records for this userId (owner). Omit to process all users (up to limit).',
    })
    @IsOptional()
    @IsString()
    userId?: string;
}
