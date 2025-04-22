import {Controller, Get, Query, Req, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {AiTool} from "../ai-tools/ai-tool.model";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {GetToolsDto} from "../ai-tools/dto/getToolsDto";
import {AiModelsService} from "../ai-models/ai-models.service";
import {AiCdrService} from "./ai-cdr.service";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vPbxUserId?: string;
}

@Controller('ai-cdr')
export class AiCdrController {

    constructor(private aiCdrService: AiCdrService) {}

    @ApiOperation({summary: "ai-cdr list page"})
    @ApiResponse({status: 200, type: AiTool})
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


}
