import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Req,
    UseGuards
} from '@nestjs/common';
import { AiModelsService } from "./ai-models.service";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { aiModel } from "./ai-models.model";
import { AiModelDto, UpdateAiModelDto } from "./dto/ai-model.dto";

interface TokenRequest extends Request {
    tokenUserId?: string;
    isAdmin?: boolean;
}

@Controller('aiModels')
export class AiModelsController {

    constructor(private aiModelService: AiModelsService) { }
    @ApiOperation({ summary: "aiModels list" })
    @ApiResponse({ status: 200, type: aiModel })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Get()
    getAll(@Req() request: TokenRequest) {
        const isAdmin = request.isAdmin ?? false;
        return this.aiModelService.getAll(isAdmin)
    }

    @ApiOperation({ summary: "Get aiModel by id" })
    @ApiResponse({ status: 200, type: [aiModel] })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
    @Get('/:id')
    getOne(@Param('id') id: number) {
        return this.aiModelService.getById(id)
    }

    @ApiOperation({ summary: "Create aiModel" })
    @ApiResponse({ status: 200, type: aiModel })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    //    @UsePipes(ValidationPipe)
    @Post()
    create(@Body() dto: AiModelDto) {
        return this.aiModelService.create(dto)
    }

    @ApiOperation({ summary: "Update aiModel" })
    @ApiResponse({ status: 200, type: aiModel })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch()
    update(@Body() dto: UpdateAiModelDto) {
        return this.aiModelService.update(dto)
    }

    @ApiOperation({ summary: "Delete aiModel" })
    @ApiResponse({ status: 200 })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete()
    delete(@Body() body: { ids: number[] }) {
        const { ids } = body
        return this.aiModelService.delete(ids)
    }
}
