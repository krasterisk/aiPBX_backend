import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const TTS_MAX_TEXT_LENGTH = 4000;
export const TTS_DEFAULT_SAMPLE_RATE = 24000;

export class SynthesizeTtsDto {
    @ApiProperty({ example: 'Здравствуйте, чем могу помочь?', description: 'Text to synthesize' })
    @IsString()
    @MinLength(1)
    @MaxLength(TTS_MAX_TEXT_LENGTH)
    text: string;

    @ApiPropertyOptional({ example: 'ru', description: 'Language code' })
    @IsOptional()
    @IsString()
    language?: string;

    @ApiPropertyOptional({
        example: 'default',
        description: "Voice id: 'default' or a .wav filename from GET /tts/voices",
    })
    @IsOptional()
    @IsString()
    voice?: string;

    @ApiPropertyOptional({ example: 24000, description: 'Output sample rate (8000–48000)' })
    @IsOptional()
    @IsInt()
    @Min(8000)
    @Max(48000)
    sampleRate?: number;

    @ApiPropertyOptional({ enum: ['wav', 'pcm'], example: 'wav', description: 'Response audio format' })
    @IsOptional()
    @IsIn(['wav', 'pcm'])
    format?: 'wav' | 'pcm';
}
