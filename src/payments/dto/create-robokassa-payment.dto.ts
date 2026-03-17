import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRobokassaPaymentDto {
    @ApiProperty({ example: 500, description: 'Amount in RUB' })
    @IsNumber()
    @Min(1)
    amount: number;

    @ApiProperty({ example: 'Account top-up', description: 'Payment description', required: false })
    @IsOptional()
    @IsString()
    description?: string;
}
