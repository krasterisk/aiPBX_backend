import {
    Controller, Post, Get, Req,
    UseGuards, UseInterceptors, UploadedFile,
    HttpException, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { WhisperService } from './whisper.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';

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
        if (!file) {
            throw new HttpException('No file provided', HttpStatus.BAD_REQUEST);
        }

        const language = req.body?.language || undefined;

        const result = await this.whisperService.transcribe(
            file.buffer,
            file.originalname,
            language,
        );

        return result;
    }

    @Get('health')
    @ApiOperation({ summary: 'Check Whisper service availability' })
    @ApiResponse({ status: 200, description: 'Health status' })
    async health() {
        return this.whisperService.healthCheck();
    }
}
