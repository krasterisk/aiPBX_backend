import { Controller, Get, Param, Post, UseGuards, HttpException, HttpStatus, Query, Req } from '@nestjs/common';
import { AiAnalyticsService } from "./ai-analytics.service";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles-auth.decorator";
import { GetAnalyticsDashboardDto, AnalyticsDashboardResponse } from "./dto/get-analytics-dashboard.dto";

interface RequestWithUser extends Request {
    isAdmin?: boolean;
    tokenUserId?: string;
    vPbxUserId?: string;
}

@ApiTags('Ai Analytics')
@Controller('ai-analytics')
export class AiAnalyticsController {
    constructor(private readonly aiAnalyticsService: AiAnalyticsService) { }

    @ApiOperation({ summary: 'Get analytics dashboard data' })
    @ApiResponse({ status: 200, description: 'Dashboard data with aggregated metrics', type: Object })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('dashboard/data')
    getDashboard(
        @Query() query: GetAnalyticsDashboardDto,
        @Req() request: RequestWithUser
    ): Promise<AnalyticsDashboardResponse> {
        const isAdmin = request.isAdmin ?? false;
        const tokenUserId = request.vPbxUserId || request.tokenUserId;
        const realUserId = isAdmin ? null : tokenUserId;

        return this.aiAnalyticsService.getAnalyticsDashboard(query, isAdmin, realUserId);
    }

    @ApiOperation({ summary: 'Get call analytics by channelId' })
    @ApiResponse({ status: 200, description: 'Analytics data' })
    @UseGuards(JwtAuthGuard)
    @Get(':channelId')
    getByChannelId(@Param('channelId') channelId: string) {
        return this.aiAnalyticsService.getAnalyticsByChannelId(channelId);
    }

    @ApiOperation({ summary: 'Create call analytics by channelId' })
    @ApiResponse({ status: 201, description: 'Analytics created' })
    @UseGuards(JwtAuthGuard)
    @Post(':channelId')
    async create(@Param('channelId') channelId: string) {
        const result = await this.aiAnalyticsService.analyzeCall(channelId);
        if (!result) {
            throw new HttpException('Analysis failed', HttpStatus.BAD_REQUEST);
        }
        return result;
    }
}
