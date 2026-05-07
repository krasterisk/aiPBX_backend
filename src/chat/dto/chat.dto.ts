import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChatDto {
    @ApiProperty({ example: 'Helpdesk', description: 'Chat name' })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ description: 'System instruction / prompt', required: false })
    @IsOptional()
    @IsString()
    instruction?: string;

    @ApiProperty({ example: 'gemma4:e4b', description: 'Model name', required: false })
    @IsOptional()
    @IsString()
    model?: string;

    @ApiProperty({ example: '0.7', description: 'Temperature', required: false })
    @IsOptional()
    @IsString()
    temperature?: string;

    @ApiProperty({ example: [1, 3], description: 'Tool IDs to attach', required: false })
    @IsOptional()
    @IsArray()
    toolIds?: number[];
}

export class UpdateChatDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    instruction?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    model?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    temperature?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsArray()
    toolIds?: number[];
}

export class ChatMessageDto {
    @IsString()
    role: 'user' | 'assistant' | 'system' | 'tool';

    @IsString()
    content: string;
}

/**
 * Ephemeral MCP server definition for per-request multi-tenancy.
 * Passed by KrAsterisk in every chat request to route tool calls
 * back to the correct tenant instance.
 */
export class EphemeralMcpServerDto {
    @ApiProperty({
        example: 'https://krasterisk.ru/api/mcp',
        description: 'MCP server URL',
    })
    @IsString()
    url: string;

    @ApiProperty({
        example: 'http',
        description: 'Transport type: http or websocket',
        required: false,
    })
    @IsOptional()
    @IsString()
    transport?: 'http' | 'websocket';

    @ApiProperty({
        example: { 'Authorization': 'Bearer token', 'X-Vpbx-User-Uid': '42' },
        description: 'Custom headers for this MCP server (auth, tenant id, etc.)',
        required: false,
    })
    @IsOptional()
    headers?: Record<string, string>;
}

export class SendMessageDto {
    @ApiProperty({ example: 'Сколько стоит консультация?', description: 'User message' })
    @IsNotEmpty()
    @IsString()
    message: string;

    @ApiProperty({ description: 'Conversation history', required: false })
    @IsOptional()
    @IsArray()
    history?: ChatMessageDto[];

    /**
     * Per-request ephemeral MCP servers.
     * Allows external services (e.g. KrAsterisk) to inject their MCP endpoint
     * with tenant-specific headers without pre-registering in the DB.
     *
     * Example from KrAsterisk:
     * mcpServers: [{
     *   url: "https://krasterisk.ru/api/mcp",
     *   transport: "http",
     *   headers: { "Authorization": "Bearer TOKEN", "X-Vpbx-User-Uid": "42" }
     * }]
     */
    @ApiProperty({
        description: 'Ephemeral MCP servers for this request (multi-tenancy support)',
        required: false,
        type: [EphemeralMcpServerDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => EphemeralMcpServerDto)
    mcpServers?: EphemeralMcpServerDto[];
}

