import {Controller, Get, Param, Query, Req, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {GetToolsDto} from "../ai-tools/dto/getToolsDto";
import {AiCdrService} from "./ai-cdr.service";
import {AiEvents} from "./ai-events.model";
import {AiCdr} from "./ai-cdr.model";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vPbxUserId?: string;
}

@Controller('reports')
export class AiCdrController {

    constructor(private aiCdrService: AiCdrService) {}

    @ApiOperation({summary: "reports list page"})
    @ApiResponse({status: 200, type: AiCdr})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetToolsDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        try {
            return this.aiCdrService.get(query, isAdmin)

        } catch (e) {
            console.log(e)
        }
    }

    @ApiOperation({summary: "Get events by channelId"})
    @ApiResponse({status: 200, type: [AiEvents]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/events/:channelId')
    getEvents(@Param('channelId') channelId: string) {
        return this.aiCdrService.getEvents(channelId)
    }

    @ApiOperation({summary: "Get dialog by channelId"})
    @ApiResponse({status: 200, type: [AiEvents]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/dialogs/:channelId')
    getDialogs(@Param('channelId') channelId: string) {
        return this.aiCdrService.getDialogs(channelId)
    }

}
