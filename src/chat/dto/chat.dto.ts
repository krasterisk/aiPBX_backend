import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ChatMessageDto {
    @ApiProperty({ example: 'user', description: 'Message role' })
    @IsString()
    role: 'user' | 'assistant' | 'system';

    @ApiProperty({ example: 'Сколько стоит консультация?', description: 'Message content' })
    @IsString()
    content: string;
}

export class ChatRequestDto {
    @ApiProperty({ example: 'Сколько стоит консультация?', description: 'User message' })
    @IsNotEmpty()
    @IsString()
    message: string;

    @ApiProperty({ example: 1, description: 'Assistant ID to use for chat configuration', required: false })
    @IsOptional()
    @IsNumber()
    assistantId?: number;

    @ApiProperty({ description: 'Conversation history', required: false })
    @IsOptional()
    @IsArray()
    history?: ChatMessageDto[];

    @ApiProperty({ example: 'session_abc123', description: 'Session ID for tracking', required: false })
    @IsOptional()
    @IsString()
    sessionId?: string;
}
