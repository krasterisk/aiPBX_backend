import {Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards} from '@nestjs/common';
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
}

@Controller('tools')
export class AiToolsController {

    constructor(private toolsService: AiToolsService) {}

    @ApiOperation({summary: "tools list"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.toolsService.getAll()
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
        try {
            return this.toolsService.get(query, isAdmin)

        } catch (e) {
            console.log(e)
        }
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
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: ToolDto[]) {
        return this.toolsService.create(dto)
    }

    @ApiOperation({summary: "Update tool"})
    @ApiResponse({status: 200, type: AiTool})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Put()
    update(@Body() dto: ToolDto) {
        return this.toolsService.update(dto)
    }

    @ApiOperation({summary: "Delete tool"})
    @ApiResponse({status: 200})
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete('/:id')
    delete(@Param('id') id: number) {
        return this.toolsService.delete(id)
    }
}
