import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Клиент из alfawebhook REST API */
export class AlfawebhookClientDto {
    @ApiPropertyOptional()
    id?: string;

    @ApiPropertyOptional({ description: 'ИНН' })
    inn?: string;

    @ApiPropertyOptional()
    kpp?: string;

    @ApiPropertyOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'URL облачной АТС' })
    pbxUrl?: string;

    @ApiPropertyOptional()
    balance?: number;

    @ApiPropertyOptional()
    licNum?: string;

    @ApiPropertyOptional()
    email?: string;

    @ApiPropertyOptional()
    phone?: string;

    @ApiPropertyOptional()
    organizationId?: string;
}

/** Параметры идентификации клиента */
export class HelpdeskIdentifyBodyDto {
    @ApiPropertyOptional()
    phone?: string;

    @ApiPropertyOptional()
    inn?: string;

    @ApiPropertyOptional()
    name?: string;
}

/** Результат идентификации клиента для бота/оператора */
export class HelpdeskIdentifyResultDto {
    @ApiProperty({ description: 'Найден ли клиент' })
    found: boolean;

    @ApiPropertyOptional({ type: AlfawebhookClientDto })
    client?: AlfawebhookClientDto;

    @ApiPropertyOptional({ description: 'До 3 вариантов при неоднозначном поиске по названию' })
    candidates?: AlfawebhookClientDto[];

    @ApiPropertyOptional({ description: 'Облачный клиент (есть pbxUrl)' })
    isCloud?: boolean;

    @ApiPropertyOptional()
    message?: string;
}
