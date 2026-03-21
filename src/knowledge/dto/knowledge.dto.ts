import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, IsNumber } from 'class-validator';

export class CreateKnowledgeBaseDto {
    @ApiProperty({ example: 'Прайс-лист', description: 'Knowledge base name' })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ example: 'Цены на товары и услуги', description: 'Description', required: false })
    @IsOptional()
    @IsString()
    description?: string;
}

export class UpdateKnowledgeBaseDto {
    @ApiProperty({ example: 'Обновлённый прайс', description: 'Knowledge base name', required: false })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ example: 'Описание', description: 'Description', required: false })
    @IsOptional()
    @IsString()
    description?: string;
}

export class AddUrlDto {
    @ApiProperty({ example: 'https://example.com/prices', description: 'URL to parse and add to knowledge base' })
    @IsNotEmpty()
    @IsUrl()
    url: string;
}

export class SearchKnowledgeDto {
    @ApiProperty({ example: 'Какие у вас цены?', description: 'Search query' })
    @IsNotEmpty()
    @IsString()
    query: string;

    @ApiProperty({ example: 5, description: 'Number of results', required: false })
    @IsOptional()
    @IsNumber()
    limit?: number;
}
