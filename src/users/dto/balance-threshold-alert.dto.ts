import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
} from 'class-validator';
import type { InvoiceAmountMode } from '../balance-threshold-alert.model';

const INVOICE_AMOUNT_MODES = ['fixed', 'average_monthly'] as const;

export class CreateBalanceThresholdAlertDto {
    @ApiPropertyOptional({ description: 'Tenant owner (admin only)' })
    @IsOptional()
    @IsString()
    ownerUserId?: string;

    @ApiProperty({ example: 100 })
    @IsNumber()
    @Min(0.01)
    limitAmount: number;

    @ApiProperty({ type: [String], example: ['notify@example.com'] })
    @IsArray()
    @IsString({ each: true })
    emails: string[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    notifyUserIds?: number[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    sendInvoice?: boolean;

    @ApiPropertyOptional()
    @ValidateIf((o) => o.sendInvoice === true)
    @IsInt()
    organizationId?: number;

    @ApiPropertyOptional({ enum: INVOICE_AMOUNT_MODES })
    @IsOptional()
    @IsIn([...INVOICE_AMOUNT_MODES])
    invoiceAmountMode?: InvoiceAmountMode;

    @ApiPropertyOptional({ example: 5000 })
    @ValidateIf((o) => o.sendInvoice === true && o.invoiceAmountMode !== 'average_monthly')
    @IsNumber()
    @Min(1)
    invoiceAmountRub?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    sendViaEdo?: boolean;
}

export class UpdateBalanceThresholdAlertDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0.01)
    limitAmount?: number;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    emails?: string[];

    @ApiPropertyOptional({ type: [Number] })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    notifyUserIds?: number[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    sendInvoice?: boolean;

    @ApiPropertyOptional()
    @ValidateIf((o) => o.sendInvoice === true)
    @IsOptional()
    @IsInt()
    organizationId?: number | null;

    @ApiPropertyOptional({ enum: INVOICE_AMOUNT_MODES })
    @IsOptional()
    @IsIn([...INVOICE_AMOUNT_MODES])
    invoiceAmountMode?: InvoiceAmountMode;

    @ApiPropertyOptional()
    @ValidateIf((o) => o.sendInvoice === true && o.invoiceAmountMode !== 'average_monthly')
    @IsOptional()
    @IsNumber()
    @Min(1)
    invoiceAmountRub?: number | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    sendViaEdo?: boolean;
}
