import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
    UseGuards, UseInterceptors, UploadedFiles,
    HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { OperatorAnalyticsService } from './operator-analytics.service';
import { OperatorDigestService } from './operator-digest.service';
import { OperatorAlertService } from './operator-alert.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';
import { ApiTokenGuard } from './guards/api-token.guard';
import { AnalyticsSource } from './operator-analytics.model';
import { CustomMetricDef, MetricDefinition } from './interfaces/operator-metrics.interface';
import { GenerateSchemaDto, BulkMoveDto, CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { AnalyzeRequestDto } from './dto/analyze.dto';
import { UpdateCallTagsDto } from './dto/call-tags.dto';
import { OperatorInsightsResponseDto } from './dto/operator-insights-response.dto';
import { OperatorEvidenceResponseDto } from './dto/operator-evidence.dto';
import {
    assertAudioFilename,
    assertDecodedSize,
    decodeBase64Audio,
} from './lib/base64-audio';



interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    vpbxUserId?: string;
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
    private readonly logger = new Logger(OperatorAnalyticsController.name);

    constructor(
        private readonly service: OperatorAnalyticsService,
        private readonly digestService: OperatorDigestService,
        private readonly alertService: OperatorAlertService,
    ) { }

    // ─── Batch Progress (JWT Auth) ───────────────────────────

    @Get('batches')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'List all active batch processes for current user' })
    @ApiResponse({ status: 200, description: 'Array of active batches with progress' })
    async getActiveBatches(@Req() req: RequestWithUser) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        const batches = this.service.getActiveBatches(userId);
        return batches.map(batch => ({
            ...batch,
            progress: Math.round(((batch.completed + batch.failed) / batch.total) * 100),
        }));
    }

    @Get('batch/:batchId')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get batch processing progress' })
    @ApiResponse({ status: 200, description: 'Batch progress with per-file status' })
    @ApiResponse({ status: 404, description: 'Batch not found' })
    async getBatchStatus(
        @Param('batchId') batchId: string,
        @Req() req: RequestWithUser,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        const batch = this.service.getBatchStatus(batchId, userId, req.isAdmin ?? false);
        if (!batch) {
            throw new HttpException('Batch not found', HttpStatus.NOT_FOUND);
        }
        return {
            ...batch,
            progress: Math.round(((batch.completed + batch.failed) / batch.total) * 100),
        };
    }

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
            consentObtained?: string;
            consentSource?: string;
        },
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
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
            consentObtained: this.parseConsent(body.consentObtained),
            consentSource: body.consentSource,
        };

        // Always async (batch-of-1 for single file) to avoid HTTP timeouts on long audio
        return this.startAsyncFileUpload(files, userId, AnalyticsSource.FRONTEND, options, body.provider);
    }

    @Post('regenerate/:channelId')
    @ApiBearerAuth()
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Regenerate operator analytics for an existing call record' })
    @ApiResponse({ status: 200, description: 'Updated call record with new analytics and billing entry' })
    @ApiResponse({ status: 402, description: 'Insufficient balance' })
    async regenerateAnalysis(
        @Param('channelId') channelId: string,
        @Req() req: RequestWithUser,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        const isAdmin = req.isAdmin ?? false;
        return this.service.regenerateAnalysis(channelId, userId, isAdmin);
    }

    // ─── External API: Upload file (API Token Auth) ───────────────────

    @Post('analyze-file')
    @UseGuards(ApiTokenGuard)
    @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_SIZE } }))
    @ApiOperation({ summary: 'Upload audio file(s) for analysis (External API)' })
    @ApiConsumes('multipart/form-data')
    @ApiResponse({ status: 200, description: 'Analysis result or batch status' })
    async uploadFromApi(
        @UploadedFiles() files: any[],
        @Req() req: RequestWithUser,
        @Body() body: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: string;
            provider?: string;
            sync?: string;
            consentObtained?: string;
            consentSource?: string;
        },
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
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
            consentObtained: this.parseConsent(body.consentObtained),
            consentSource: body.consentSource,
        };

        if (files.length === 1 && body.sync === 'true') {
            return this.service.analyzeFile(
                files[0].buffer, files[0].originalname, userId, AnalyticsSource.API, options,
            );
        }

        return this.startAsyncFileUpload(files, userId, AnalyticsSource.API, options, body.provider);
    }

    // ─── External API: Unified analyze (URL XOR Base64) ──────────────

    @Post('analyze')
    @UseGuards(ApiTokenGuard)
    @ApiOperation({
        summary: 'Analyze audio by URL or Base64 body (External API)',
        description:
            'Exactly one source type per request: url/urls OR file/files. ' +
            'sync=true waits for a single item; multiple items are always async.',
    })
    @ApiResponse({ status: 200, description: 'Analysis result, processing stub, or batch status' })
    @ApiResponse({ status: 400, description: 'Invalid source / Base64 / filename' })
    @ApiResponse({ status: 413, description: 'Decoded file too large' })
    async analyzeUnified(
        @Req() req: RequestWithUser,
        @Body() body: AnalyzeRequestDto,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        const hasUrl = Boolean(body.url?.trim()) || Boolean(body.urls?.length);
        const hasFile = Boolean(body.file?.trim()) || Boolean(body.files?.length);

        if (!hasUrl && !hasFile) {
            throw new HttpException(
                'url or urls or file or files is required',
                HttpStatus.BAD_REQUEST,
            );
        }
        if (hasUrl && hasFile) {
            throw new HttpException(
                'Provide either URL (url/urls) or Base64 (file/files), not both',
                HttpStatus.BAD_REQUEST,
            );
        }

        const projectId = body.projectId != null
            ? +body.projectId
            : (req as any).apiToken?.projectId ?? undefined;
        const options = {
            operatorName: body.operatorName,
            clientPhone: body.clientPhone,
            language: body.language,
            customMetrics: body.customMetrics,
            provider: body.provider,
            projectId,
            consentObtained: this.parseConsent(body.consentObtained),
            consentSource: body.consentSource,
        };
        const sync = this.parseSync(body.sync);

        if (hasUrl) {
            return this.analyzeUnifiedFromUrls(userId, body, options, sync);
        }
        return this.analyzeUnifiedFromBase64(userId, body, options, sync);
    }

    // ─── External API: Analyze by URL (API Token Auth) ───────────────

    @Post('analyze-url')
    @UseGuards(ApiTokenGuard)
    @ApiOperation({ summary: 'Analyze audio by URL — single or batch (External API)' })
    @ApiResponse({ status: 200, description: 'Analysis result (single) or batch status (multiple)' })
    async analyzeFromUrl(
        @Req() req: RequestWithUser,
        @Body() body: {
            url?: string;
            urls?: string[];
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            consentObtained?: string | boolean;
            consentSource?: string;
        },
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        const projectId = (body as any).projectId
            ? +(body as any).projectId
            : (req as any).apiToken?.projectId ?? undefined;

        const options = {
            operatorName: body.operatorName,
            clientPhone: body.clientPhone,
            language: body.language,
            customMetrics: body.customMetrics,
            provider: body.provider,
            projectId,
            consentObtained: this.parseConsent(body.consentObtained),
            consentSource: body.consentSource,
        };

        // Single URL → async (same as batch)
        if (body.url && !body.urls?.length) {
            const filename = body.url.split('/').pop()?.split('?')[0] || 'download.mp3';
            const record = await this.service.createProcessingRecord(
                filename, userId, AnalyticsSource.API, options,
            );
            await record.update({ recordUrl: body.url });
            this.service.processUrlInBackground(record.id, body.url, body.provider);
            return { id: record.id, filename, url: body.url, status: 'processing' };
        }

        // Batch URLs → async
        const urlList = body.urls?.length ? body.urls : body.url ? [body.url] : [];
        if (urlList.length === 0) {
            throw new HttpException('url or urls is required', HttpStatus.BAD_REQUEST);
        }

        const items = [];
        for (const url of urlList) {
            const filename = url.split('/').pop()?.split('?')[0] || 'download.mp3';
            const record = await this.service.createProcessingRecord(
                filename, userId, AnalyticsSource.API, options,
            );
            await record.update({ recordUrl: url });
            items.push({ id: record.id, filename, url, status: 'processing' });
            this.service.processUrlInBackground(record.id, url, body.provider);
        }

        return { items };
    }

    // ─── External API: Results list (API Token Auth) ─────────────────

    @Get('results')
    @UseGuards(ApiTokenGuard)
    @ApiOperation({ summary: 'List analysis results for token project' })
    @ApiResponse({ status: 200, description: 'Paginated list of results' })
    async getResults(
        @Req() req: RequestWithUser,
        @Query() query: {
            page?: number;
            limit?: number;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

        const projectId = (req as any).apiToken?.projectId;
        return this.service.getCdrs(
            { ...query, projectId },
            false,
            userId,
        );
    }

    // ─── External API: Result by ID (API Token Auth) ─────────────────

    @Get('results/:id')
    @UseGuards(ApiTokenGuard)
    @ApiOperation({ summary: 'Get analysis result by ID' })
    @ApiResponse({ status: 200, description: 'Full analysis result with transcript and metrics' })
    @ApiResponse({ status: 404, description: 'Not found' })
    async getResultById(
        @Param('id') id: string,
        @Req() req: RequestWithUser,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        const tokenProjectId = (req as any).apiToken?.projectId;
        return this.service.getById(+id, userId, tokenProjectId ?? undefined);
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
        @Body() body: { name?: string; projectId?: number; ownerUserId?: string },
    ) {
        const selfId = req.vpbxUserId || req.tokenUserId;
        const ownerId = req.isAdmin && body.ownerUserId
            ? String(body.ownerUserId)
            : selfId;
        return this.service.generateApiToken(
            ownerId,
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
    async listTokens(
        @Req() req: RequestWithUser,
        @Query('userId') listUserId?: string,
    ) {
        if (req.isAdmin && (listUserId == null || listUserId === '')) {
            return this.service.getApiTokens();
        }
        const ownerId = req.isAdmin && listUserId
            ? String(listUserId)
            : (req.vpbxUserId || req.tokenUserId);
        return this.service.getApiTokens(ownerId);
    }

    @Patch('tokens/:id/revoke')
    @Patch('api/tokens/:id/revoke') // legacy alias
    @Post('api/tokens/:id/revoke')  // legacy POST alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Revoke an API token' })
    async revokeToken(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.revokeApiToken(
            +id,
            req.vpbxUserId || req.tokenUserId,
            req.isAdmin ?? false,
        );
    }

    @Delete('tokens/:id')
    @Delete('api/tokens/:id')       // legacy alias
    @Post('api/tokens/:id/delete')  // legacy POST alias
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete an API token' })
    async deleteToken(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteApiToken(
            +id,
            req.vpbxUserId || req.tokenUserId,
            req.isAdmin ?? false,
        );
    }

    // ─── Projects — Static routes FIRST (before :id) ─────────────────

    @Post('projects/generate-schema')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Generate custom metrics schema from chat context' })
    @ApiResponse({ status: 200, description: 'MetricDefinition[]' })
    async generateSchema(
        @Req() req: RequestWithUser,
        @Body() body: GenerateSchemaDto,
    ) {
        if (!(req.vpbxUserId || req.tokenUserId)) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        return this.service.generateMetricsSchema(body.messages, body.systemPrompt);
    }

    // ─── Projects — CRUD ─────────────────────────────────────────────

    @Get('projects')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'List projects (with recordCount)' })
    async listProjects(
        @Req() req: RequestWithUser,
        @Query('userId') listUserId?: string,
    ) {
        const filterUserId = req.isAdmin && listUserId ? String(listUserId) : undefined;
        return this.service.getProjects(
            req.vpbxUserId || req.tokenUserId,
            req.isAdmin ?? false,
            filterUserId,
        );
    }

    @Post('projects')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Create a project (optionally from template)' })
    async createProject(
        @Req() req: RequestWithUser,
        @Body() body: CreateProjectDto,
    ) {
        const selfId = req.vpbxUserId || req.tokenUserId;
        const ownerId = req.isAdmin && body.ownerUserId
            ? String(body.ownerUserId)
            : selfId;
        return this.service.createProject(ownerId, body);
    }

    @Post('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update a project (POST fallback)' })
    async updateProjectPost(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: UpdateProjectDto,
    ) {
        return this.service.updateProject(
            +id,
            req.vpbxUserId || req.tokenUserId,
            body,
            req.isAdmin ?? false,
        );
    }

    @Patch('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update a project' })
    async updateProject(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: UpdateProjectDto,
    ) {
        return this.service.updateProject(
            +id,
            req.vpbxUserId || req.tokenUserId,
            body,
            req.isAdmin ?? false,
        );
    }

    @Post('projects/:id/digest/send')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Send analytics digest now (email + Telegram)' })
    @ApiResponse({ status: 200, description: 'Digest delivery result' })
    async sendProjectDigest(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
    ) {
        return this.digestService.sendManual(
            +id,
            req.vpbxUserId || req.tokenUserId,
            req.isAdmin ?? false,
        );
    }

    @Post('projects/:id/alerts/test')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Send a test critical alert (email + Telegram), does not stamp lastAlertAt' })
    @ApiResponse({ status: 200, description: 'Test alert delivery result' })
    async sendProjectAlertTest(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
    ) {
        return this.alertService.sendTestAlert(
            +id,
            req.vpbxUserId || req.tokenUserId,
            req.isAdmin ?? false,
        );
    }

    @Post('projects/:id/delete')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete a project (POST fallback)' })
    async deleteProjectPost(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteProject(+id, req.vpbxUserId || req.tokenUserId, req.isAdmin ?? false);
    }

    @Delete('projects/:id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete a project' })
    async deleteProject(@Req() req: RequestWithUser, @Param('id') id: string) {
        return this.service.deleteProject(+id, req.vpbxUserId || req.tokenUserId, req.isAdmin ?? false);
    }



    @Get('projects/:id/dashboard')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get project-specific dashboard data' })
    async getProjectDashboard(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Query() query: { startDate?: string; endDate?: string; operatorName?: string },
    ) {
        return this.service.getProjectDashboard(
            +id, req.vpbxUserId || req.tokenUserId, req.isAdmin ?? false, query,
        );
    }

    @Post('projects/:id/preview')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Preview a metric on a mock call' })
    async previewMetric(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Body() body: MetricDefinition,
    ) {
        return this.service.previewMetric(+id, req.vpbxUserId || req.tokenUserId, body);
    }

    @Get('projects/:id/insights')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get AI-generated insights for project (deprecated — use GET /insights?projectId=)', deprecated: true })
    @ApiResponse({ status: 200, type: OperatorInsightsResponseDto })
    async getProjectInsights(
        @Req() req: RequestWithUser,
        @Param('id') id: string,
        @Query() query: { startDate?: string; endDate?: string; userId?: string; refresh?: string },
    ) {
        return this.service.getProjectInsights(
            +id, req.vpbxUserId || req.tokenUserId, req.isAdmin ?? false, query,
        );
    }


    // ─── CDR List (JWT Auth) ─────────────────────────────────────────

    @Patch('cdrs/bulk-move')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Bulk move CDRs to another project' })
    async bulkMoveCdrs(
        @Req() req: RequestWithUser,
        @Body() body: BulkMoveDto,
    ) {
        return this.service.bulkMoveCdrs(req.vpbxUserId || req.tokenUserId, body.ids, body.targetProjectId);
    }

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
            operatorNameExact?: string;
            tagId?: string;
            sentiment?: string;
            success?: string;
            projectId?: number;
            page?: number;
            limit?: number;
            search?: string;
            sortField?: string;
            sortOrder?: string;
        },
    ) {
        const isAdmin = req.isAdmin ?? false;
        const realUserId = isAdmin ? null : (req.vpbxUserId || req.tokenUserId);
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
            userId?: string;
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
        },
    ) {
        const isAdmin = req.isAdmin ?? false;
        const realUserId = isAdmin ? null : (req.vpbxUserId || req.tokenUserId);
        return this.service.getDashboard(query, isAdmin, realUserId);
    }

    // ─── AI Insights (JWT Auth) ──────────────────────────────────────

    @Get('insights')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get AI-generated structured insights (project optional)' })
    @ApiResponse({ status: 200, type: OperatorInsightsResponseDto, description: 'Structured AI insights with priority, evidence, and metadata' })
    async getDashboardInsights(
        @Req() req: RequestWithUser,
        @Query() query: {
            userId?: string;
            startDate?: string;
            endDate?: string;
            operatorName?: string;
            projectId?: number;
            refresh?: string;
        },
    ) {
        const isAdmin = req.isAdmin ?? false;
        const authUserId = req.vpbxUserId || req.tokenUserId;
        const realUserId = isAdmin ? null : authUserId;
        return this.service.getInsights(query, isAdmin, realUserId, authUserId);
    }

    @Get('operator-evidence')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get aggregated per-metric evidence for an operator or the whole filtered set' })
    @ApiResponse({ status: 200, type: OperatorEvidenceResponseDto, description: 'Per-metric quotes and rationales' })
    async getOperatorEvidence(
        @Req() req: RequestWithUser,
        @Query() query: {
            operatorName?: string;
            userId?: string;
            startDate?: string;
            endDate?: string;
            projectId?: number;
            limit?: number;
            order?: string;
        },
    ) {
        const order = query.order ?? 'worst';
        if (order !== 'worst' && order !== 'best') {
            throw new HttpException('order must be worst or best', HttpStatus.BAD_REQUEST);
        }
        const isAdmin = req.isAdmin ?? false;
        const authUserId = req.vpbxUserId || req.tokenUserId;
        const realUserId = isAdmin ? null : authUserId;
        return this.service.getOperatorEvidence(
            {
                operatorName: query.operatorName?.trim() || undefined,
                userId: query.userId,
                startDate: query.startDate,
                endDate: query.endDate,
                projectId: query.projectId,
                limit: query.limit,
                order: order as 'worst' | 'best',
            },
            isAdmin,
            realUserId,
            authUserId,
        );
    }

    // ─── Human-in-the-loop metric overrides (JWT Auth) ───────────────

    @Get(':id/overrides')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'List supervisor metric overrides for a record' })
    async getOverrides(@Param('id') id: string, @Req() req: RequestWithUser) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        return this.service.getMetricOverrides(id, userId, req.isAdmin ?? false);
    }

    @Post(':id/overrides')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Create/update supervisor metric overrides (stored separately from LLM values)' })
    async saveOverrides(
        @Param('id') id: string,
        @Req() req: RequestWithUser,
        @Body() body: {
            overrides: Array<{
                metricId: string;
                origin?: 'default' | 'custom' | 'summary';
                numValue?: number | null;
                boolValue?: boolean | null;
                strValue?: string | null;
                note?: string | null;
            }>;
        },
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        return this.service.saveMetricOverrides(id, userId, req.isAdmin ?? false, body?.overrides);
    }

    @Delete(':id/overrides/:metricId')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Delete a supervisor metric override' })
    async deleteOverride(
        @Param('id') id: string,
        @Param('metricId') metricId: string,
        @Req() req: RequestWithUser,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        return this.service.deleteMetricOverride(id, metricId, userId, req.isAdmin ?? false);
    }

    @Patch(':id/tags')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Update manual call tags for an analysed call' })
    async updateCallTags(
        @Param('id') id: string,
        @Req() req: RequestWithUser,
        @Body() body: UpdateCallTagsDto,
    ) {
        const userId = req.vpbxUserId || req.tokenUserId;
        if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        return this.service.updateCallTags(
            id,
            userId,
            req.isAdmin ?? false,
            body.tagIds ?? [],
            body.tagNames,
        );
    }

    // ─── Get by ID (JWT or API Token) ────────────────────────────────

    @Get(':id')
    @ApiBearerAuth()
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get analysis details by ID' })
    @ApiResponse({ status: 200, description: 'Full analysis result' })
    @ApiResponse({ status: 404, description: 'Not found' })
    async getById(
        @Param('id') id: string,
        @Req() req: RequestWithUser,
    ) {
        // Prefer vpbx id for tenancy, but also accept internal users.id — historical
        // aiCdr.userId rows may store either depending on when the analysis was created.
        const isAdmin = req.isAdmin ?? false;
        const userId = req.vpbxUserId || req.tokenUserId || null;
        if (!isAdmin && !userId) {
            throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        }
        return this.service.getById(
            +id,
            userId,
            undefined,
            isAdmin,
            [req.tokenUserId, req.vpbxUserId],
        );
    }

    // ─── Helpers ─────────────────────────────────────────────────────

    private async analyzeUnifiedFromUrls(
        userId: string,
        body: AnalyzeRequestDto,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            projectId?: number;
            consentObtained?: boolean;
            consentSource?: string;
        },
        sync: boolean,
    ) {
        const urlList = body.urls?.length
            ? body.urls
            : body.url
                ? [body.url]
                : [];
        if (urlList.length === 0) {
            throw new HttpException('url or urls is required', HttpStatus.BAD_REQUEST);
        }

        if (urlList.length === 1 && sync) {
            return this.service.analyzeUrl(urlList[0], userId, options);
        }

        if (urlList.length === 1) {
            const url = urlList[0];
            const filename = url.split('/').pop()?.split('?')[0] || 'download.mp3';
            const record = await this.service.createProcessingRecord(
                filename, userId, AnalyticsSource.API, options,
            );
            await record.update({ recordUrl: url });
            this.service.processUrlInBackground(record.id, url, body.provider);
            return { id: record.id, filename, url, status: 'processing' };
        }

        const items = [];
        for (const url of urlList) {
            const filename = url.split('/').pop()?.split('?')[0] || 'download.mp3';
            const record = await this.service.createProcessingRecord(
                filename, userId, AnalyticsSource.API, options,
            );
            await record.update({ recordUrl: url });
            items.push({ id: record.id, filename, url, status: 'processing' });
            this.service.processUrlInBackground(record.id, url, body.provider);
        }
        return { items };
    }

    private async analyzeUnifiedFromBase64(
        userId: string,
        body: AnalyzeRequestDto,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            projectId?: number;
            consentObtained?: boolean;
            consentSource?: string;
        },
        sync: boolean,
    ) {
        const items: { buffer: Buffer; filename: string }[] = [];

        if (body.files?.length) {
            for (const item of body.files) {
                assertAudioFilename(item.filename);
                const { buffer } = decodeBase64Audio(item.data);
                assertDecodedSize(buffer);
                this.logger.log(
                    `Base64 decoded "${item.filename}": ${buffer.length} bytes ` +
                    `(b64Chars=${item.data?.length ?? 0})`,
                );
                items.push({ buffer, filename: item.filename.trim() });
            }
        } else if (body.file?.trim()) {
            assertAudioFilename(body.filename || '');
            const { buffer } = decodeBase64Audio(body.file);
            assertDecodedSize(buffer);
            this.logger.log(
                `Base64 decoded "${body.filename}": ${buffer.length} bytes ` +
                `(b64Chars=${body.file.length})`,
            );
            items.push({ buffer, filename: body.filename!.trim() });
        }

        if (items.length === 0) {
            throw new HttpException('file or files is required', HttpStatus.BAD_REQUEST);
        }

        if (items.length === 1 && sync) {
            return this.service.analyzeFile(
                items[0].buffer, items[0].filename, userId, AnalyticsSource.API, options,
            );
        }

        const fakeFiles = items.map((i) => ({
            buffer: i.buffer,
            originalname: i.filename,
            size: i.buffer.length,
            mimetype: 'audio/mpeg',
        }));
        return this.startAsyncFileUpload(
            fakeFiles, userId, AnalyticsSource.API, options, body.provider,
        );
    }

    private parseSync(value?: string | boolean): boolean {
        if (value === true) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    }

    private async startAsyncFileUpload(
        files: any[],
        userId: string,
        source: AnalyticsSource,
        options: {
            operatorName?: string;
            clientPhone?: string;
            language?: string;
            customMetrics?: CustomMetricDef[];
            provider?: string;
            projectId?: number;
            consentObtained?: boolean;
            consentSource?: string;
        },
        provider?: string,
    ) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const batchItems = [];
        const responseItems = [];
        for (const file of files) {
            const record = await this.service.createProcessingRecord(
                file.originalname, userId, source, options,
            );
            batchItems.push({ recordId: record.id, buffer: file.buffer, filename: file.originalname });
            responseItems.push({ id: record.id, filename: file.originalname, status: 'pending' });
        }
        this.service.startBatch(batchId, userId, batchItems, provider);
        return { batchId, total: files.length, items: responseItems };
    }

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

    /** Parse a consent flag from a multipart/string or JSON boolean body value. */
    private parseConsent(value?: string | boolean): boolean | undefined {
        if (value === undefined || value === null || value === '') return undefined;
        if (typeof value === 'boolean') return value;
        const v = String(value).toLowerCase();
        if (v === 'true' || v === '1' || v === 'yes') return true;
        if (v === 'false' || v === '0' || v === 'no') return false;
        return undefined;
    }
}
