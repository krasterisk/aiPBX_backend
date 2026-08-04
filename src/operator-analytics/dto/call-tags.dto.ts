import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';

export class UpdateCallTagsDto {
    @ApiProperty({
        example: ['returns', 'billing'],
        description: 'Theme ids from the project callTaxonomy, or free-form ids when taxonomy is empty',
        type: [String],
    })
    @IsArray()
    @ArrayMaxSize(10)
    @ArrayUnique()
    @IsString({ each: true })
    @MaxLength(100, { each: true })
    tagIds: string[];

    @ApiPropertyOptional({
        example: { returns: 'Возвраты', 'my-topic': 'Моя тема' },
        description: 'Optional display names for free-form tags (and snapshots)',
        type: 'object',
        additionalProperties: { type: 'string' },
    })
    @IsOptional()
    @IsObject()
    tagNames?: Record<string, string>;
}
