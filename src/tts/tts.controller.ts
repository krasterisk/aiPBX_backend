import { Body, Controller, Get, HttpCode, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { SynthesizeTtsDto } from './dto/synthesize-tts.dto';
import { TtsService } from './tts.service';

@ApiTags('TTS')
@ApiSecurity('api-key')
@RequireApiKeyScope(API_KEY_SCOPES.TTS_SYNTHESIZE)
@UseGuards(ApiKeyGuard)
@Controller('tts')
export class TtsController {
    constructor(private readonly ttsService: TtsService) {}

    @ApiOperation({
        summary: 'Synthesize speech via OmniVoice',
        description:
            'Requires API key with scope tts:synthesize. Default response is WAV (PCM16 mono). Use format=pcm for raw PCM16 LE.',
    })
    @ApiProduces('audio/wav', 'audio/pcm')
    @ApiResponse({ status: 200, description: 'Audio bytes (WAV or PCM16 LE mono)' })
    @ApiResponse({ status: 400, description: 'Invalid text' })
    @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
    @ApiResponse({ status: 502, description: 'OmniVoice unavailable' })
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    @HttpCode(200)
    @Post()
    async synthesize(
        @Body() dto: SynthesizeTtsDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        const result = await this.ttsService.synthesize(dto);
        const ext = result.contentType === 'audio/wav' ? 'wav' : 'pcm';
        res.set({
            'Content-Type': result.contentType,
            'X-Sample-Rate': String(result.sampleRate),
            'X-Channels': '1',
            'X-Bits-Per-Sample': '16',
            'X-Duration-Seconds': result.durationSeconds.toFixed(3),
            'Content-Disposition': `inline; filename="speech.${ext}"`,
        });
        return new StreamableFile(result.audio, { type: result.contentType });
    }

    @ApiOperation({ summary: 'OmniVoice health' })
    @Get('health')
    health() {
        return this.ttsService.healthCheck();
    }

    @ApiOperation({ summary: 'List uploaded voice reference files' })
    @Get('voices')
    voices() {
        return this.ttsService.listVoices();
    }
}
