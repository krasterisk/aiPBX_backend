import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class HelpdeskToolsIdentifyDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    inn?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;
}

export class HelpdeskToolsClientRefDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    clientId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    inn?: string;
}

export class HelpdeskToolsCreateTicketDto {
    @ApiProperty()
    @IsString()
    subject: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    priority?: string;

    @ApiPropertyOptional({ description: 'Original Caller ID (D-04)' })
    @IsOptional()
    @IsString()
    callerPhone?: string;

    @ApiPropertyOptional({ description: 'Alternate contact phone if different (D-04)' })
    @IsOptional()
    @IsString()
    contactPhone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    clientName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    alfawebhookClientId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    inn?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    transcript?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    source?: string;
}

export class HelpdeskToolsAddMessageDto {
    @ApiProperty()
    @IsInt()
    ticketId: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    role?: string;

    @ApiProperty()
    @IsString()
    content: string;
}

export class HelpdeskToolsPbxClientDto {
    @ApiProperty()
    @IsString()
    clientId: string;
}

export class HelpdeskToolsPromisedPaymentDto extends HelpdeskToolsPbxClientDto {
    @ApiPropertyOptional({ default: 2 })
    @IsOptional()
    @IsInt()
    @Min(2)
    @Max(5)
    days?: number;
}

export class HelpdeskToolsHangupDto extends HelpdeskToolsPbxClientDto {
    @ApiProperty()
    @IsString()
    channelId: string;

    @ApiProperty()
    @IsBoolean()
    confirm: boolean;
}

export class HelpdeskLlmContextOverrideDto {
    @ApiPropertyOptional({ nullable: true })
    @IsOptional()
    @IsString()
    markdownOverride?: string | null;
}
