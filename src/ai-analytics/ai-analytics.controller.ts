import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AiAnalyticsService } from "./ai-analytics.service";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles-auth.decorator";

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
}
