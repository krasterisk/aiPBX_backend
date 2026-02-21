import {
    Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req,
    UseGuards, UseInterceptors, UploadedFile, UploadedFiles,
    HttpException, HttpStatus,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';
import { ApiTokenGuard } from './guards/api-token.guard';
import { AnalyticsSource } from './operator-analytics.model';
import { CustomMetricDef } from './interfaces/operator-metrics.interface';


interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    isApiToken?: boolean;
    apiToken?: { projectId?: number;[key: string]: any };
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIMES = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/flac',
];

@ApiTags('Operator Analytics')
@Controller('operator-analytics')
export class OperatorAnalyticsController {
    constructor(private readonly service: OperatorAnalyticsService) { }

    // ─── Frontend Upload (JWT Auth) ──────────────────────────────────

    @Post('upload')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiOperation({ summary: 'Upload audio file(s) for operator analysis (Frontend)' })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, description: 'Analysis result (single file) or batch status (multiple files)' })
    @ApiResponse({ status: 402, description: 'Insufficient balance' })
    @ApiResponse({ status: 413, description: 'File too large' })
    async uploadFromFrontend(
        @UploadedFiles() files: any[],
        @Req() req: RequestWithUser,
        @Body() body: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: string;
            provider?: string;
            projectId?: string;
        },
    ) {
        const userId = req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        if (!files || files.length === 0) {
            throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
        }

        // Validate files
        this.validateFiles(files);

        const customMetrics = this.parseCustomMetrics(body.customMetrics);
        // projectId: explicit body value takes priority, then fall back to token's default project
        const projectId = body.projectId
            ? +body.projectId
            : (req as any).apiToken?.projectId ?? undefined;
        const options = {
            operatorName: body.operatorName,
            clientPhone: body.clientPhone,
            language: body.language,
            customMetrics,
            provider: body.provider,
            projectId,
        };

        // Hybrid logic: 1 file → sync, N files → async
        if (files.length === 1) {
            const file = files[0];
            return this.service.analyzeFile(
                file.buffer, file.originalname, userId, AnalyticsSource.FRONTEND, options,
            );
        }

        // Multiple files → batch
        const items = [];
        for (const file of files) {
            const record = await this.service.createProcessingRecord(
                file.originalname, userId, AnalyticsSource.FRONTEND, options,
            );
            items.push({ id: record.id, filename: file.originalname, status: 'processing' });

            // Fire and forget background processing
            this.service.processInBackground(record.id, file.buffer, body.provider);
        }

        return { items };
    }

    // ─── External API Upload (API Token Auth) ────────────────────────

    @Post('api/analyze')
    @UseGuards(ApiTokenGuard)
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiOperation({ summary: 'Upload audio file(s) for analysis (External API)' })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, description: 'Analysis result or batch status' })
    async analyzeFromApi(
        @UploadedFiles() files: any[],
        @Req() req: RequestWithUser,
        @Body() body: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: string;
            provider?: string;
        },
    ) {
        const userId = req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        if (!files || files.length === 0) {
            throw new HttpException('No files provided', HttpStatus.BAD_REQUEST);
        }

        this.validateFiles(files);

        const customMetrics = this.parseCustomMetrics(body.customMetrics);
        const projectId = (body as any).projectId
            ? +(body as any).projectId
            : (req as any).apiToken?.projectId ?? undefined;
        const options = {
            operatorName: body.operatorName,
            clientPhone: body.clientPhone,
            language: body.language,
            customMetrics,
            provider: body.provider,
            projectId,
        };

        if (files.length === 1) {
            return this.service.analyzeFile(
                files[0].buffer, files[0].originalname, userId, AnalyticsSource.API, options,
            );
        }

        const items = [];
        for (const file of files) {
            const record = await this.service.createProcessingRecord(
                file.originalname, userId, AnalyticsSource.API, options,
            );
            items.push({ id: record.id, filename: file.originalname, status: 'processing' });
            this.service.processInBackground(record.id, file.buffer, body.provider);
        }

        return { items };
    }

    // ─── External API: Analyze by URL (API Token Auth) ───────────────

    @Post('api/analyze-url')
    @UseGuards(ApiTokenGuard)
    @ApiOperation({ summary: 'Analyze audio by URL (External API)' })
    @ApiResponse({ status: 200, description: 'Full analysis result' })
    async analyzeFromUrl(
        @Req() req: RequestWithUser,
        @Body() body: {
            url: string;
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
        },
    ) {
        const userId = req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        if (!body.url) {
            throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
        }

        const projectId = (body as any).projectId
            ? +(body as any).projectId
            : (req as any).apiToken?.projectId ?? undefined;
        return this.service.analyzeUrl(body.url, userId, {
            operatorName: body.operatorName,
            clientPhone: body.clientPhone,
            language: body.language,
            customMetrics: body.customMetrics,
            provider: body.provider,
            projectId,
        });
    }

    // ─── API Token Management (JWT Auth) ─────────────────────────────

    @Post('tokens/generate')
    @Post('api/generate-token')     // legacy alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Generate a new API token' })
    @ApiResponse({ status: 201, description: 'Token generated' })
    async generateToken(
        @Req() req: RequestWithUser,
        @Body() body: { name?: string; projectId?: number },
    ) {
        return this.service.generateApiToken(
            req.tokenUserId,
            body.name,
            body.projectId ? +body.projectId : undefined,
        );
    }

    @Get('tokens')
    @Get('api/tokens')              // legacy alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'List API tokens (with projectName)' })
    async listTokens(@Req() req: RequestWithUser) {
        return this.service.getApiTokens(req.tokenUserId);
    }

    @Patch('tokens/:id/revoke')
    @Patch('api/tokens/:id/revoke') // legacy alias
    @Post('api/tokens/:id/revoke')  // legacy POST alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Revoke an API token' })
    async revokeToken(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.revokeApiToken(+id, req.tokenUserId);
    }

    @Delete('tokens/:id')
    @Delete('api/tokens/:id')       // legacy alias
    @Post('api/tokens/:id/delete')  // legacy POST alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete an API token' })
    async deleteToken(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteApiToken(+id, req.tokenUserId);
    }

    // ─── Projects (JWT Auth) ─────────────────────────────────────────

    @Get('projects')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'List projects' })
    async listProjects(@Req() req: RequestWithUser) {
        return this.service.getProjects(req.tokenUserId, req.isAdmin ?? false);
    }

    @Post('projects')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Create a project' })
    async createProject(
        @Req() req: RequestWithUser,
        @Body() body: { name: string; description?: string },
    ) {
        return this.service.createProject(req.tokenUserId, body.name, body.description);
    }

    @Post('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update a project (POST fallback)' })
    async updateProjectPost(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: { name?: string; description?: string },
    ) {
        return this.service.updateProject(+id, req.tokenUserId, body.name, body.description);
    }

    @Patch('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update a project (name/description)' })
    async updateProject(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: { name?: string; description?: string },
    ) {
        return this.service.updateProject(+id, req.tokenUserId, body.name, body.description);
    }

    @Post('projects/:id/delete')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete a project (POST fallback)' })
    async deleteProjectPost(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteProject(+id, req.tokenUserId);
    }

    @Delete('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete a project' })
    async deleteProject(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteProject(+id, req.tokenUserId);
    }

    // ─── CDR List (JWT Auth) ─────────────────────────────────────────

    @Get('cdrs')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get CDR list of analyzed calls' })
    @ApiResponse({ status: 200, description: 'Paginated CDR list' })
    async getCdrs(
        @Req() req: RequestWithUser,
        @Query() query: {
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
            page?: number;
            limit?: number;
        },
    ) {
        const isAdmin = req.isAdmin ?? false;
        const realUserId = isAdmin ? null : req.tokenUserId;
        return this.service.getCdrs(query, isAdmin, realUserId);
    }

    // ─── Dashboard (JWT Auth) ────────────────────────────────────────

    @Get('dashboard')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get aggregated dashboard data' })
    @ApiResponse({ status: 200, description: 'Dashboard metrics' })
    async getDashboard(
        @Req() req: RequestWithUser,
        @Query() query: {
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
        },
    ) {
        const isAdmin = req.isAdmin ?? false;
        const realUserId = isAdmin ? null : req.tokenUserId;
        return this.service.getDashboard(query, isAdmin, realUserId);
    }

    // ─── Get by ID (JWT or API Token) ────────────────────────────────

    @Get(':id')
    @ApiOperation({ summary: 'Get analysis details by ID' })
    @ApiResponse({ status: 200, description: 'Full analysis result' })
    @ApiResponse({ status: 404, description: 'Not found' })
    async getById(
        @Param('id') id: string,
        @Req() req: RequestWithUser,
    ) {
        // Try API token first, then fall back to JWT parsing
        const userId = req.tokenUserId || null;
        return this.service.getById(+id, userId);
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private validateFiles(files: any[]) {
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                throw new HttpException(
                    `File "${file.originalname}" exceeds 50 MB limit`,
                    HttpStatus.PAYLOAD_TOO_LARGE,
                );
            }
            if (!ALLOWED_MIMES.includes(file.mimetype)) {
                throw new HttpException(
                    `File "${file.originalname}" has unsupported format: ${file.mimetype}`,
                    HttpStatus.BAD_REQUEST,
                );
            }
        }
    }

    private parseCustomMetrics(raw?: string): CustomMetricDef[] | undefined {
        if (!raw) return undefined;
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }
}
