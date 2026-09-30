import {
    Controller, Post, Get, Req,
    UseGuards, UseInterceptors, UploadedFile,
    HttpException, HttpStatus, HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiConsumes, ApiSecurity } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WhisperService } from './whisper.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

@ApiTags('Whisper')
@Controller('whisper')
export class WhisperController {
    constructor(private readonly whisperService: WhisperService) {}

    @Post('recognize')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiOperation({ summary: 'Recognize speech from audio file via Whisper' })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, description: 'Transcription result { text, duration }' })
    @ApiResponse({ status: 400, description: 'No file provided' })
    @ApiResponse({ status: 502, description: 'Whisper service error' })
    async recognize(
        @UploadedFile() file: any,
        @Req() req: any,
    ) {
        return this.transcribeUpload(file, req.body?.language);
    }

    @Post('transcribe')
    @HttpCode(200)
    @ApiSecurity('api-key')
    @RequireApiKeyScope(API_KEY_SCOPES.STT_TRANSCRIBE)
    @UseGuards(ApiKeyGuard)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiOperation({
        summary: 'Transcribe audio for external services',
        description:
            'Bearer aipbx_… with scope stt:transcribe. Keys with scopes=null are allowed. Multipart field "file", optional form field "language".',
    })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, description: 'Transcription result { text, duration, segments }' })
    @ApiResponse({ status: 400, description: 'No file provided' })
    @ApiResponse({ status: 401, description: 'Missing, invalid, or out-of-scope API key' })
    @ApiResponse({ status: 502, description: 'Whisper service error' })
    async transcribe(
        @UploadedFile() file: any,
        @Req() req: any,
    ) {
        return this.transcribeUpload(file, req.body?.language);
    }

    @Get('health')
    @ApiOperation({ summary: 'Check Whisper service availability' })
    @ApiResponse({ status: 200, description: 'Health status' })
    async health() {
        return this.whisperService.healthCheck();
    }

    private transcribeUpload(file: { buffer: Buffer; originalname: string } | undefined, language?: string) {
        if (!file) {
            throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
        }

        return this.whisperService.transcribe(
            file.buffer,
            file.originalname,
            language || undefined,
        );
    }
}
