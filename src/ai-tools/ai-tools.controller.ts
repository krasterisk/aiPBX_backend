import {Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards} from '@nestjs/common';
import {AiToolsService} from "./ai-tools.service";
import {ApiOperation, ApiResponse} from "@nestjs/swagger";
import {Roles} from "../auth/roles-auth.decorator";
import {RolesGuard} from "../auth/roles.guard";
import {AiTool} from "./ai-tool.model";
import {ToolDto} from "./dto/tool.dto";
import {GetToolsDto} from "./dto/getToolsDto";

interface RequestWithUser extends Request {
    isAdmin?: boolean
    tokenUserId?: string
    vpbxUserId?: string;
}

@Controller('tools')
export class AiToolsController {

    constructor(private toolsService: AiToolsService) {}

    @ApiOperation({summary: "tools list"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll(@Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const tokenUserId = request.vpbxUserId || request.tokenUserId
        const realUserId = !isAdmin && tokenUserId
        return this.toolsService.getAll(realUserId, isAdmin)
    }

    @ApiOperation({summary: "Tools list page"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get('page')
    get(@Query() query: GetToolsDto,
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.toolsService.get(query, isAdmin, userId)

    }


    @ApiOperation({summary: "Get tool by id"})
    @ApiResponse({status: 200, type: [AiTool]})
    @Roles('ADMIN','USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.toolsService.getById(id)
    }

    @ApiOperation({summary: "Create tool"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(
        @Body() dto: ToolDto[],
        @Req() request: RequestWithUser) {
        const isAdmin = request.isAdmin
        const userId = request.tokenUserId
        return this.toolsService.create(dto, isAdmin, userId)
    }

    @ApiOperation({summary: "Update tool"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: ToolDto) {
        return this.toolsService.update(dto)
    }

    @ApiOperation({summary: "Delete tool"})
    @ApiResponse({status: 200})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: number) {
        return this.toolsService.delete(id)
    }
}
