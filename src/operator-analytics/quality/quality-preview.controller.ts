import { OperatorAnalyticsService } from '../operator-analytics.service';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { Roles } from '../../auth/roles-auth.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { QualityPreviewService } from './quality-preview.service';
import { QualityScoreConfig } from './quality-score';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { QualityDetailDto, QualityHistoryDto, QualityRulesDto } from './quality-score.dto';
import { QualityReadQueryDto } from './quality-read-query.dto';
type QualityOwnerRequest = { vpbxUserId?: string; tokenUserId?: string; isAdmin?: boolean };

@ApiTags('Quality preview')
@Controller('quality-preview')
@Roles('ADMIN', 'USER')
@UseGuards(RolesGuard)
export class QualityPreviewController {
    constructor(private readonly preview: QualityPreviewService, private readonly analyses: OperatorAnalyticsService) {}
    private owner(req: any) {
        const user = req.vpbxUserId || req.tokenUserId;
        if (!user) throw new BadRequestException('Missing authenticated owner');
        return String(user);
    }
    @Get('dashboard')
    dashboard(@Query() query: QualityReadQueryDto, @Req() req: QualityOwnerRequest) {
        return this.analyses.getDashboard(query, req.isAdmin === true, this.owner(req), true);
    }
    @Get('cdrs')
    cdrs(@Query() query: QualityReadQueryDto, @Req() req: QualityOwnerRequest) {
        return this.analyses.getCdrs(query, req.isAdmin === true, this.owner(req), true);
    }
    @Get('operator-evidence')
    evidence(@Query() query: QualityReadQueryDto, @Req() req: QualityOwnerRequest) {
        return this.analyses.getOperatorEvidence(query, req.isAdmin === true, this.owner(req), this.owner(req), true);
    }
    @Get('projects/:id/rules')
    @ApiResponse({ status: 200, type: QualityRulesDto })
    rules(@Param('id') id: string, @Req() req: any) {
        return this.preview.rules(Number(id), this.owner(req), req.isAdmin === true);
    }
    @Patch('projects/:id/rules')
    @ApiResponse({ status: 200, type: QualityRulesDto })
    saveRules(@Param('id') id: string, @Body() body: QualityScoreConfig, @Req() req: any) {
        return this.preview.rules(Number(id), this.owner(req), req.isAdmin === true, body);
    }
    @Get('calls/:channelId')
    @ApiResponse({ status: 200, type: QualityDetailDto })
    async detail(@Param('channelId') id: string, @Query('runId') runId: string | undefined, @Req() req: any) {
        if (runId && !/^[a-f0-9-]{36}$/i.test(runId)) throw new BadRequestException('Invalid run');
        const owner = this.owner(req), admin = req.isAdmin === true;
        await this.preview.ensure(id, owner, admin);
        return this.preview.scoring.detail(id, owner, admin, runId);
    }
    @Get('calls/:channelId/history')
    @ApiResponse({ status: 200, type: [QualityHistoryDto] })
    async history(@Param('channelId') id: string, @Query('before') before: string | undefined, @Query('limit') limit: string | undefined, @Req() req: any) {
        const size = limit === undefined ? 20 : Number(limit);
        if (!Number.isInteger(size) || size < 1 || size > 100 || before && !/^[a-f0-9-]{36}$/i.test(before))
            throw new BadRequestException('Invalid history pagination');
        const owner = this.owner(req), admin = req.isAdmin === true;
        await this.preview.authorize(id, owner, admin);
        return this.preview.scoring.history(id, owner, admin, size, before);
    }
    @Post('calls/:channelId/analyze')
    @Roles('ADMIN')
    @ApiResponse({ status: 200, type: QualityDetailDto })
    analyze(@Param('channelId') id: string, @Req() req: any) {
        return this.analyses.analyzeQualityPreview(id, this.owner(req), req.isAdmin === true);
    }
    @Post('calls/:channelId/overrides')
    async correct(@Param('channelId') id: string, @Body() body: { overrides: any[] }, @Req() req: any) {
        const actor = this.owner(req);
        const cdr = await this.preview.authorize(id, actor, req.isAdmin === true);
        await this.preview.ensure(id, actor, req.isAdmin === true);
        return this.preview.scoring.reviseOverrides(id, String(cdr.userId), actor, body?.overrides);
    }
    @Delete('calls/:channelId/overrides/:metricId')
    async reset(@Param('channelId') id: string, @Param('metricId') metricId: string, @Req() req: any) {
        const actor = this.owner(req);
        const cdr = await this.preview.authorize(id, actor, req.isAdmin === true);
        return this.preview.scoring.reviseOverrides(id, String(cdr.userId), actor, [], metricId);
    }
}
