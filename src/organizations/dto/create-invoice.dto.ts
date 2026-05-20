import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateInvoiceDto {
    @ApiProperty({ example: 10000 })
    @IsNumber()
    @Min(0.01)
    amountRub: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    subject?: string | null;

    @ApiProperty({ required: false, description: 'Issuer our-organization id (admin override)' })
    @IsOptional()
    @IsInt()
    ourOrganizationId?: number | null;

    @ApiProperty({
        required: false,
        default: false,
        description: 'Create invoice in SBIS (EDO). If false, only local PDF is generated.',
    })
    @IsOptional()
    @IsBoolean()
    sendViaEdo?: boolean;
}
