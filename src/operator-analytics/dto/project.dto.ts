import { IsString, IsArray, IsOptional, IsNumber, MaxLength, IsUrl, IsEnum, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Metric Definition DTO ───────────────────────────────────────

class MetricDefinitionDto {
    @ApiProperty({ example: 'upsell_attempt', description: 'snake_case identifier' })
    @IsString()
    @MaxLength(50)
    id: string;

    @ApiProperty({ example: 'Попытка апселла' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ enum: ['boolean', 'number', 'enum', 'string'] })
    @IsEnum(['boolean', 'number', 'enum', 'string'])
    type: 'boolean' | 'number' | 'enum' | 'string';

    @ApiProperty({ example: 'Did the operator attempt to upsell additional services?' })
    @IsString()
    @MaxLength(500)
    description: string;

    @ApiPropertyOptional({ example: ['low', 'medium', 'high'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    enumValues?: string[];
}

// ─── Update Schema DTO ───────────────────────────────────────────

export class UpdateSchemaDto {
    @ApiProperty({ type: [MetricDefinitionDto], description: 'Custom metrics definitions' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetricDefinitionDto)
    @ArrayMaxSize(20)
    customMetricsSchema: MetricDefinitionDto[];

    @ApiPropertyOptional({ description: 'Business context for LLM (max 1000 chars)' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    systemPrompt?: string;

    @ApiPropertyOptional({ description: 'Which default metrics to show' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    visibleDefaultMetrics?: string[];
}

// ─── Update Webhook DTO ──────────────────────────────────────────

export class UpdateWebhookDto {
    @ApiPropertyOptional({ example: 'https://example.com/webhook' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    webhookUrl?: string;

    @ApiPropertyOptional({ example: ['analysis.completed', 'analysis.error'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    webhookEvents?: string[];
}

// ─── Generate Schema DTO ─────────────────────────────────────────

class ChatMessageDto {
    @IsString()
    role: string;

    @IsString()
    @MaxLength(2000)
    content: string;
}

export class GenerateSchemaDto {
    @ApiProperty({ description: 'Chat messages context for schema generation' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    messages: ChatMessageDto[];

    @ApiPropertyOptional({ description: 'Optional system prompt for context' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    systemPrompt?: string;
}

// ─── Project Chat DTO ────────────────────────────────────────────

export class ProjectChatDto {
    @ApiProperty({ description: 'User message' })
    @IsString()
    @MaxLength(2000)
    message: string;

    @ApiPropertyOptional({ description: 'Previous chat history' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    history?: ChatMessageDto[];
}

// ─── Bulk Move CDRs DTO ──────────────────────────────────────────

export class BulkMoveDto {
    @ApiProperty({ description: 'Record IDs to move', example: [1, 2, 3] })
    @IsArray()
    @IsNumber({}, { each: true })
    ids: number[];

    @ApiProperty({ description: 'Target project ID', example: 5 })
    @IsNumber()
    targetProjectId: number;
}

// ─── Create Project Extended DTO ─────────────────────────────────

export class CreateProjectDto {
    @ApiProperty({ example: 'Отдел продаж' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ example: 'Входящие звонки менеджеров продаж' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Template ID to initialize from' })
    @IsOptional()
    @IsString()
    templateId?: string;
}
