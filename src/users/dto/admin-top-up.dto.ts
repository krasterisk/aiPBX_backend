import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdminTopUpDto {
    @ApiProperty({ example: '1', description: 'Target user ID' })
    @IsNotEmpty({ message: 'userId is required' })
    @IsString()
    userId: string;

    @ApiProperty({ example: 100, description: 'Amount to add to balance' })
    @IsNotEmpty({ message: 'amount is required' })
    @IsNumber()
    @Min(0.01, { message: 'Amount must be greater than 0' })
    amount: number;

    @ApiProperty({ example: 'USD', description: 'Currency', required: false })
    @IsOptional()
    @IsString()
    currency?: string;

    @ApiProperty({ example: 'bank_transfer', description: 'Payment method (e.g. bank_transfer, cash, crypto)' })
    @IsNotEmpty({ message: 'paymentMethod is required' })
    @IsString()
    paymentMethod: string;

    @ApiProperty({ example: 'Manual top-up by admin', description: 'Payment description / info', required: false })
    @IsOptional()
    @IsString()
    paymentInfo?: string;
}
