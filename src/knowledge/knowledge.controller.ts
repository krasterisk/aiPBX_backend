import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Put,
    Query,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';
import { AddUrlDto, CreateKnowledgeBaseDto, UpdateKnowledgeBaseDto } from './dto/knowledge.dto';

@ApiTags('Knowledge Base')
@UseGuards(JwtAuthGuard)
@Controller('knowledge-bases')
export class KnowledgeController {
    constructor(private readonly knowledgeService: KnowledgeService) {}

    private isAdmin(req: any): boolean {
        return req.user?.roles?.some((role: any) => role.value === 'ADMIN') ?? false;
    }

    // ── Knowledge Base CRUD ─────────────────────────────────

    @ApiOperation({ summary: 'Create a knowledge base' })
    @Post()
    async createKnowledgeBase(@Body() dto: CreateKnowledgeBaseDto, @Req() req: any) {
        return this.knowledgeService.createKnowledgeBase(req.user.id, dto.name, dto.description);
    }

    @ApiOperation({ summary: 'List all knowledge bases' })
    @Get()
    async getKnowledgeBases(@Req() req: any) {
        return this.knowledgeService.getKnowledgeBases(req.user.id, this.isAdmin(req));
    }

    @ApiOperation({ summary: 'Update a knowledge base' })
    @Put(':id')
    async updateKnowledgeBase(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateKnowledgeBaseDto,
        @Req() req: any,
    ) {
        return this.knowledgeService.updateKnowledgeBase(id, req.user.id, dto, this.isAdmin(req));
    }

    @ApiOperation({ summary: 'Delete a knowledge base' })
    @Delete(':id')
    async deleteKnowledgeBase(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
        await this.knowledgeService.deleteKnowledgeBase(id, req.user.id, this.isAdmin(req));
        return { success: true };
    }

    // ── Documents ───────────────────────────────────────────

    @ApiOperation({ summary: 'List documents in a knowledge base' })
    @Get(':id/documents')
    async getDocuments(@Param('id', ParseIntPipe) id: number) {
        return this.knowledgeService.getDocuments(id);
    }

    @ApiOperation({ summary: 'Upload a file to knowledge base' })
    @ApiConsumes('multipart/form-data')
    @Post(':id/upload')
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const allowed = [
                'application/pdf',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-excel',
                'text/csv',
                'text/plain',
                'text/markdown',
            ];
            if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|docx|xlsx|xls|csv|txt|md)$/i)) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
            }
        },
    }))
    async uploadFile(
        @Param('id', ParseIntPipe) id: number,
        @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
        @Req() req: any,
    ) {
        // Multer decodes filename as latin1 — re-encode back to bytes and decode as UTF-8
        file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf-8');
        return this.knowledgeService.uploadFile(id, req.user.id, file);
    }

    @ApiOperation({ summary: 'Add URL to knowledge base' })
    @Post(':id/url')
    async addUrl(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: AddUrlDto,
        @Req() req: any,
    ) {
        return this.knowledgeService.addUrl(id, req.user.id, dto.url);
    }

    @ApiOperation({ summary: 'Delete a document' })
    @Delete(':id/documents/:docId')
    async deleteDocument(
        @Param('docId', ParseIntPipe) docId: number,
        @Req() req: any,
    ) {
        await this.knowledgeService.deleteDocument(docId, req.user.id, this.isAdmin(req));
        return { success: true };
    }

    // ── Search (debug) ──────────────────────────────────────

    @ApiOperation({ summary: 'Search knowledge base (debug)' })
    @Get(':id/search')
    async search(
        @Param('id', ParseIntPipe) id: number,
        @Query('q') query: string,
        @Query('limit') limit?: string,
    ) {
        if (!query) return { error: 'Query parameter "q" is required' };
        const results = await this.knowledgeService.search(id, query, limit ? parseInt(limit) : 5);
        return { query, results };
    }
}
