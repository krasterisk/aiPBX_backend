import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import {
    HELPDESK_TICKET_CATEGORIES,
    HELPDESK_TICKET_PRIORITIES,
    HELPDESK_TICKET_SOURCES,
    HELPDESK_TICKET_STATUSES,
} from '../helpdesk.constants';

export class CreateHelpdeskTicketDto {
    @ApiPropertyOptional({ example: 'Проблема с регистрацией SIP' })
    @IsOptional()
    @IsString()
    @MaxLength(512)
    subject?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_CATEGORIES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_CATEGORIES])
    category?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_PRIORITIES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_PRIORITIES])
    priority?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_SOURCES, default: 'manual' })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_SOURCES])
    source?: string;

    @ApiPropertyOptional({ description: 'Caller ID (оригинальный номер звонка)' })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    callerPhone?: string;

    @ApiPropertyOptional({ description: 'Контактный номер, если отличается от Caller ID' })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    contactPhone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(128)
    alfawebhookClientId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(16)
    inn?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(512)
    clientName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    transcript?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_STATUSES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_STATUSES])
    status?: string;
}

export class UpdateHelpdeskTicketDto {
    @ApiPropertyOptional({ enum: HELPDESK_TICKET_STATUSES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_STATUSES])
    status?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_CATEGORIES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_CATEGORIES])
    category?: string;

    @ApiPropertyOptional({ enum: HELPDESK_TICKET_PRIORITIES })
    @IsOptional()
    @IsIn([...HELPDESK_TICKET_PRIORITIES])
    priority?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(512)
    subject?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsInt()
    assigneeId?: number | null;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    transcript?: string;
}

export class CreateHelpdeskMessageDto {
    @ApiProperty({ example: 'Оператор уточнил детали' })
    @IsString()
    content: string;

    @ApiPropertyOptional({ enum: ['user', 'assistant', 'operator', 'system'], default: 'operator' })
    @IsOptional()
    @IsIn(['user', 'assistant', 'operator', 'system'])
    role?: string;
}

export class HelpdeskTicketListQueryDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    priority?: string;

    @ApiPropertyOptional({ description: 'null = только неназначенные' })
    @IsOptional()
    @IsString()
    assigneeId?: string;

    @ApiPropertyOptional({ description: 'Поиск по имени клиента, ИНН, телефону' })
    @IsOptional()
    @IsString()
    q?: string;
}
