import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

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
    role: 'user' | 'assistant' | 'system';

    @IsString()
    content: string;
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
}
