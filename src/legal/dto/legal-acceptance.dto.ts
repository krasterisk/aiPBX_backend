import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length, ValidateNested, IsArray, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

const ALLOWED_KINDS = ['public_offer', 'personal_data_policy'] as const;

export class LegalAcceptanceItemDto {
    @ApiProperty({ enum: ALLOWED_KINDS })
    @IsString()
    @IsIn(ALLOWED_KINDS as unknown as string[])
    kind: 'public_offer' | 'personal_data_policy';

    @ApiProperty({ example: '2026-05-18' })
    @IsString()
    @Length(1, 32)
    version: string;

    @ApiProperty({ example: '2026-05-18' })
    @IsString()
    @Length(1, 128)
    contentHash: string;
}

export class LegalAcceptanceBatchDto {
    @ApiProperty({ type: [LegalAcceptanceItemDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => LegalAcceptanceItemDto)
    items: LegalAcceptanceItemDto[];

    @ApiProperty({ required: false, description: 'login | signup | activation | manual' })
    @IsOptional()
    @IsString()
    source?: string;
}
