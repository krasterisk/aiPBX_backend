import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
}
