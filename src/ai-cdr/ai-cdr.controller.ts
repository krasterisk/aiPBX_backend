import { Controller, Delete, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AiCdrService } from "./ai-cdr.service";
import { AiEvents } from "./ai-events.model";
import { AiCdr } from "./ai-cdr.model";
import { GetAiCdrDto } from "./dto/getAiCdr.dto";
import { GetDashboardDto } from "./dto/getDashboardDto";
import { JournalQuery } from './journal-selection';

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}

@Controller('reports')
export class AiCdrController {

    constructor(private aiCdrService: AiCdrService) { }

    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('quality-preview')
    qualityPreview(@Query() query: JournalQuery, @Req() request: RequestWithUser) {
        const admin = request.isAdmin ?? false;
        return this.aiCdrService.get(query, admin, admin ? null : request.vpbxUserId || request.tokenUserId, true, true);
    }

    @ApiOperation({ summary: 'Preview journal with server-side multiselect (legacy page unchanged)' })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('journal')
    journal(@Query() query: JournalQuery, @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin ?? false;
        const userId = isAdmin ? null : request.vpbxUserId || request.tokenUserId;
        return this.aiCdrService.get(query, isAdmin, userId, true);
    }

    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('journal/options')
    journalOptions(@Query() query: JournalQuery, @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin ?? false;
        const userId = isAdmin ? null : request.vpbxUserId || request.tokenUserId;
        return this.aiCdrService.getJournalOptions(query, isAdmin, userId);
    }

    @ApiOperation({ summary: "reports list page" })
    @ApiResponse({ status: 200, type: AiCdr })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetAiCdrDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin ?? false;
        const realUserId = isAdmin ? null : String(request.vpbxUserId || request.tokenUserId);
        try {
            return this.aiCdrService.get(query, isAdmin, realUserId)

        } catch (e) {
            // console.log(e)
        }
    }

    @ApiOperation({ summary: "Get events by channelId" })
    @ApiResponse({ status: 200, type: [AiEvents] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/events/:channelId')
    getEvents(@Param('channelId') channelId: string) {
        return this.aiCdrService.getEvents(channelId)
    }

    @ApiOperation({ summary: "Get dialog by channelId" })
    @ApiResponse({ status: 200, type: [AiEvents] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/dialogs/:channelId')
    getDialogs(@Param('channelId') channelId: string, @Req() req: RequestWithUser) {
        return this.aiCdrService.getDialogs(channelId, req.isAdmin ? undefined : String(req.vpbxUserId || req.tokenUserId))
    }

    @ApiOperation({ summary: "Get dashboard data" })
    @ApiResponse({ status: 200, type: AiCdr })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    // @UsePipes(ValidationPipe)
    @Get('dashboard')
    getDashboard(@Query() query: GetDashboardDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        if (!isAdmin) {
            query.userId = String(request.vpbxUserId || request.tokenUserId);
        }
        try {
            return this.aiCdrService.getDashboardData(query, isAdmin)

        } catch (e) {
            console.log(e)
        }
    }

    @ApiOperation({ summary: 'Delete call report (admin only)' })
    @ApiResponse({ status: 200, description: 'Report deleted' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete(':id')
    deleteReport(
        @Param('id') id: string,
        @Req() request: RequestWithUser,
    ) {
        const isAdmin = request.isAdmin ?? false;
        return this.aiCdrService.deleteReport(id, isAdmin);
    }

}
