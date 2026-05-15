import { ApiProperty } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class CreateOrganizationDto {
    @ApiProperty({ example: 'My Corp', description: 'Organization Name' })
    @IsString()
    @MinLength(1)
    @MaxLength(255)
    readonly name: string;

    @ApiProperty({ example: '1234567890', description: 'TIN (INN) 10 for UL, 12 for IP' })
    @IsString()
    @Matches(/^(\d{10}|\d{12})$/, { message: 'INN must be 10 or 12 digits' })
    readonly tin: string;

    @ApiProperty({ example: '123 Main St', description: 'Address' })
    @IsString()
    @MinLength(1)
    @MaxLength(500)
    readonly address: string;

    @ApiProperty({ required: false, enum: ['ul', 'ip'] })
    @IsOptional()
    @IsIn(['ul', 'ip'])
    readonly legalForm?: 'ul' | 'ip' | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Matches(/^\d{9}$/, { message: 'KPP must be 9 digits when provided' })
    readonly kpp?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Matches(/^(\d{13}|\d{15})?$/, { message: 'OGRN must be 13 or 15 digits' })
    readonly ogrn?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    readonly director?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    readonly email?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    readonly phone?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Matches(/^(\d{20})?$/, { message: 'Bank account must be 20 digits' })
    readonly bankAccount?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @Matches(/^(\d{9})?$/, { message: 'BIC must be 9 digits' })
    readonly bankBic?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    readonly bankName?: string | null;

    @ApiProperty({ required: false, description: 'Service name for invoices (max 500 chars)' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    readonly subject?: string | null;

    @ApiProperty({
        required: false,
        description: 'ADMIN only: create this organization for the given cabinet user id',
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    readonly ownerUserId?: number;
}
