import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class CreateOurOrganizationDto {
    @ApiProperty()
    @IsString()
    readonly name: string;

    @ApiProperty({ description: 'INN' })
    @IsString()
    readonly tin: string;

    @ApiProperty()
    @IsString()
    readonly address: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly kpp?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly ogrn?: string | null;

    @ApiProperty({ required: false, enum: ['ul', 'ip'] })
    @IsOptional()
    @IsIn(['ul', 'ip'])
    readonly legalForm?: 'ul' | 'ip' | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly director?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsBoolean()
    readonly isPrimary?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly bankName?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly bankBranchName?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly bankBic?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly bankAccount?: string | null;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    readonly bankCorrAccount?: string | null;
}

export class UpdateOurOrganizationDto extends CreateOurOrganizationDto {
    @ApiProperty()
    @IsString()
    readonly id: string;
}
