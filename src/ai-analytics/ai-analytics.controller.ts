import { Controller, Get, Param, Post, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { AiAnalyticsService } from "./ai-analytics.service";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags('Ai Analytics')
@Controller('ai-analytics')
export class AiAnalyticsController {
    constructor(private readonly aiAnalyticsService: AiAnalyticsService) { }

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
