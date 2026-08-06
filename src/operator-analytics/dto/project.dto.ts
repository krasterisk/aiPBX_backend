import { IsString, IsArray, IsOptional, IsNumber, IsObject, MaxLength, IsEnum, ValidateNested, ArrayMaxSize, IsBoolean, IsEmail, Min, Max, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Tag Definition DTO ────────────────────────────────────────────

export class TagDefinitionDto {
    @ApiProperty({ example: 'returns', description: 'snake_case identifier' })
    @IsString()
    @MaxLength(50)
    id: string;

    @ApiProperty({ example: 'Возвраты' })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ example: ['возврат', 'вернуть товар'], description: 'Synonym phrases for keyword matching' })
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(30)
    @MaxLength(100, { each: true })
    aliases: string[];

    @ApiPropertyOptional({ example: '#5ed3f3' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    color?: string;

    @ApiPropertyOptional({ example: 'Клиент просит вернуть товар или деньги' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;
}

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

    @ApiPropertyOptional({ example: 0, description: 'Number scale minimum (default 0)' })
    @IsOptional()
    @IsNumber()
    min?: number;

    @ApiPropertyOptional({ example: 10, description: 'Number scale maximum (default 100)' })
    @IsOptional()
    @IsNumber()
    max?: number;

    @ApiPropertyOptional({ example: '/10', description: 'Optional display suffix' })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    unit?: string;

    @ApiPropertyOptional({ enum: ['positive', 'negative', 'neutral'], description: 'Coloring semantics' })
    @IsOptional()
    @IsEnum(['positive', 'negative', 'neutral'])
    polarity?: 'positive' | 'negative' | 'neutral';
}

// ─── Update Schema DTO ───────────────────────────────────────────

export class UpdateSchemaDto {
    @ApiProperty({ type: [MetricDefinitionDto], description: 'Custom metrics definitions' })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetricDefinitionDto)
    @ArrayMaxSize(20)
    customMetricsSchema: MetricDefinitionDto[];

    @ApiPropertyOptional({ type: [TagDefinitionDto], description: 'Call topic taxonomy' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TagDefinitionDto)
    @ArrayMaxSize(20)
    callTaxonomy?: TagDefinitionDto[];

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

// ─── Digest Config DTO ───────────────────────────────────────────
// Must be declared before CreateProjectDto / UpdateProjectDto:
// emitDecoratorMetadata evaluates design:type at class init time.

export class DigestConfigDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    enabled: boolean;

    @ApiProperty({ example: ['ops@example.com'], type: [String] })
    @IsArray()
    @ArrayMaxSize(10)
    @IsEmail({}, { each: true })
    emails: string[];

    @ApiProperty({ example: ['123456789'], type: [String] })
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(32, { each: true })
    @Matches(/^-?\d+$/, { each: true, message: 'telegramChatIds must be numeric chat ids' })
    telegramChatIds: string[];

    @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
    @IsEnum(['daily', 'weekly', 'monthly'])
    schedule: 'daily' | 'weekly' | 'monthly';

    @ApiProperty({ enum: ['last_7_days', 'last_30_days', 'previous_calendar_month'] })
    @IsEnum(['last_7_days', 'last_30_days', 'previous_calendar_month'])
    reportWindow: 'last_7_days' | 'last_30_days' | 'previous_calendar_month';

    @ApiPropertyOptional({ example: 1, description: 'ISO weekday 1=Mon … 7=Sun' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(7)
    weeklyDay?: number;

    @ApiPropertyOptional({ example: 1, description: 'Day of month 1–28' })
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(28)
    monthlyDay?: number;

    @ApiPropertyOptional({ example: 9, description: 'Hour 0–23 in server TIMEZONE' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(23)
    sendHour?: number;
}

// ─── Alert Config DTO ────────────────────────────────────────────

class AlertRuleCsatDropDto {
    @IsBoolean()
    enabled: boolean;

    @IsNumber()
    @Min(1)
    @Max(100)
    dropPct: number;

    @IsNumber()
    @Min(1)
    @Max(90)
    windowDays: number;

    @IsNumber()
    @Min(1)
    @Max(1000)
    minCalls: number;
}

class AlertRuleNegativeSpikeDto {
    @IsBoolean()
    enabled: boolean;

    @IsNumber()
    @Min(1)
    @Max(100)
    spikePp: number;

    @IsNumber()
    @Min(1)
    @Max(90)
    windowDays: number;

    @IsNumber()
    @Min(1)
    @Max(1000)
    minCalls: number;
}

class AlertRuleBudgetExceededDto {
    @IsBoolean()
    enabled: boolean;
}

export class AlertConfigDto {
    @ApiProperty({ example: true })
    @IsBoolean()
    enabled: boolean;

    @ApiProperty({ example: true })
    @IsBoolean()
    inheritRecipientsFromDigest: boolean;

    @ApiProperty({ type: [String] })
    @IsArray()
    @ArrayMaxSize(10)
    @IsEmail({}, { each: true })
    emails: string[];

    @ApiProperty({ type: [String] })
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(32, { each: true })
    @Matches(/^-?\d+$/, { each: true, message: 'telegramChatIds must be numeric chat ids' })
    telegramChatIds: string[];

    @ValidateNested()
    @Type(() => AlertRuleCsatDropDto)
    csatDrop: AlertRuleCsatDropDto;

    @ValidateNested()
    @Type(() => AlertRuleNegativeSpikeDto)
    negativeSpike: AlertRuleNegativeSpikeDto;

    @ValidateNested()
    @Type(() => AlertRuleBudgetExceededDto)
    budgetExceeded: AlertRuleBudgetExceededDto;
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

    @ApiPropertyOptional({ description: 'Business context prompt for LLM (max 1000 chars)' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    systemPrompt?: string;

    @ApiPropertyOptional({ type: [MetricDefinitionDto], description: 'Custom metrics definitions' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetricDefinitionDto)
    @ArrayMaxSize(20)
    customMetricsSchema?: MetricDefinitionDto[];

    @ApiPropertyOptional({ type: [TagDefinitionDto], description: 'Call topic taxonomy' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TagDefinitionDto)
    @ArrayMaxSize(20)
    callTaxonomy?: TagDefinitionDto[];

    @ApiPropertyOptional({ description: 'Which default metrics to show' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    visibleDefaultMetrics?: string[];

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

    @ApiPropertyOptional({ example: { Authorization: 'Bearer xxx' }, description: 'Custom headers for webhook requests' })
    @IsOptional()
    @IsObject()
    webhookHeaders?: Record<string, string>;

    @ApiPropertyOptional({ example: 50, description: 'Monthly spend budget in USD (null/0 = disabled)' })
    @IsOptional()
    @IsNumber()
    monthlyBudgetUsd?: number | null;

    @ApiPropertyOptional({ example: ['ops@example.com'], description: 'Emails notified on budget exceed' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    budgetAlertEmails?: string[] | null;

    @ApiPropertyOptional({ type: () => DigestConfigDto, description: 'Email/Telegram dashboard digest settings' })
    @IsOptional()
    @ValidateNested()
    @Type(() => DigestConfigDto)
    digestConfig?: DigestConfigDto | null;

    @ApiPropertyOptional({ type: () => AlertConfigDto, description: 'Critical analytics alert settings' })
    @IsOptional()
    @ValidateNested()
    @Type(() => AlertConfigDto)
    alertConfig?: AlertConfigDto | null;
}

// ─── Update Project DTO ──────────────────────────────────────────

export class UpdateProjectDto {
    @ApiPropertyOptional({ example: 'Отдел продаж' })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @ApiPropertyOptional({ example: 'Входящие звонки менеджеров продаж' })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @ApiPropertyOptional({ description: 'Business context prompt for LLM (max 1000 chars)' })
    @IsOptional()
    @IsString()
    @MaxLength(1000)
    systemPrompt?: string;

    @ApiPropertyOptional({ type: [MetricDefinitionDto], description: 'Custom metrics definitions' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetricDefinitionDto)
    @ArrayMaxSize(20)
    customMetricsSchema?: MetricDefinitionDto[];

    @ApiPropertyOptional({ type: [TagDefinitionDto], description: 'Call topic taxonomy' })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => TagDefinitionDto)
    @ArrayMaxSize(20)
    callTaxonomy?: TagDefinitionDto[];

    @ApiPropertyOptional({ description: 'Which default metrics to show' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    visibleDefaultMetrics?: string[];

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

    @ApiPropertyOptional({ example: { Authorization: 'Bearer xxx' }, description: 'Custom headers for webhook requests' })
    @IsOptional()
    @IsObject()
    webhookHeaders?: Record<string, string>;

    @ApiPropertyOptional({ example: 50, description: 'Monthly spend budget in USD (null/0 = disabled)' })
    @IsOptional()
    @IsNumber()
    monthlyBudgetUsd?: number | null;

    @ApiPropertyOptional({ example: ['ops@example.com'], description: 'Emails notified on budget exceed' })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    budgetAlertEmails?: string[] | null;

    @ApiPropertyOptional({ type: () => DigestConfigDto, description: 'Email/Telegram dashboard digest settings' })
    @IsOptional()
    @ValidateNested()
    @Type(() => DigestConfigDto)
    digestConfig?: DigestConfigDto | null;

    @ApiPropertyOptional({ type: () => AlertConfigDto, description: 'Critical analytics alert settings' })
    @IsOptional()
    @ValidateNested()
    @Type(() => AlertConfigDto)
    alertConfig?: AlertConfigDto | null;
}
