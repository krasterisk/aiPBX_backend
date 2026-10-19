import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min, Max } from 'class-validator';

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

    @ApiPropertyOptional({ description: 'Explicit thinking control; omission retains the model default.' })
    @IsOptional()
    @IsBoolean()
    think?: boolean;

    @ApiPropertyOptional({ minimum: 0, maximum: 1 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    top_p?: number;

    @ApiPropertyOptional({ minimum: -2, maximum: 2 })
    @IsOptional()
    @IsNumber()
    @Min(-2)
    @Max(2)
    presence_penalty?: number;

    @ApiPropertyOptional({ description: 'JSON object or bounded JSON schema output; validated before inference.' })
    @IsOptional()
    @IsObject()
    response_format?: Record<string, unknown>;

    @ApiPropertyOptional({ description: 'OpenAI tools. Returned as tool_calls, not executed here.' })
    @IsOptional()
    @IsArray()
    tools?: unknown[];

    @ApiPropertyOptional()
    @IsOptional()
    tool_choice?: unknown;
}
