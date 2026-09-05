import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class ChatCompletionsRequest {
    @ApiPropertyOptional({ example: 'gemma4:e4b' })
    @IsOptional()
    @IsString()
    model?: string;

    @ApiProperty({
        example: [{ role: 'user', content: 'Привет' }],
        description: 'OpenAI-style messages. The client owns history and tools.',
    })
    @IsArray()
    messages: Array<{
        role: string;
        content?: unknown;
        name?: string;
        tool_calls?: unknown;
        tool_call_id?: string;
    }>;

    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    stream?: boolean;

    @ApiPropertyOptional({ example: 0.7 })
    @IsOptional()
    @IsNumber()
    temperature?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    max_tokens?: number;

    @ApiPropertyOptional({ description: 'OpenAI tools. Returned as tool_calls, not executed here.' })
    @IsOptional()
    @IsArray()
    tools?: unknown[];

    @ApiPropertyOptional()
    @IsOptional()
    tool_choice?: unknown;
}
