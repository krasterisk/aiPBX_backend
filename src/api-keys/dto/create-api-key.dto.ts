import {
    IsArray,
    IsISO8601,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
    @ApiProperty({ example: 'KrAsterisk production', description: 'Human-readable label' })
    @IsString()
    @MinLength(1)
    name: string;

    @ApiProperty({
        example: ['chat:message', 'models:read'],
        description: 'Scopes. Null/omit = all scopes.',
        required: false,
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    scopes?: string[];

    @ApiProperty({
        example: '2027-01-01T00:00:00Z',
        description: 'ISO 8601 expiry. Omit for no expiry.',
        required: false,
    })
    @IsOptional()
    @IsISO8601()
    expiresAt?: string;
}
