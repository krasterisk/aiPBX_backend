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
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/roles-auth.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { aiModel } from "./ai-models.model";
import { AiModelDto, UpdateAiModelDto } from "./dto/ai-model.dto";
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequireApiKeyScope, API_KEY_SCOPES } from '../api-keys/api-key-scope.decorator';

interface TokenRequest extends Request {
    tokenUserId?: string;
    isAdmin?: boolean;
}

@ApiTags('AI Models')
@Controller('aiModels')
export class AiModelsController {

    constructor(private aiModelService: AiModelsService) { }

    // ── JWT-protected CRUD (admin + user) ────────────────────────────────────

    @ApiOperation({ summary: "aiModels list (JWT)" })
    @ApiResponse({ status: 200, type: aiModel })
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
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

    // ── API Key — external services endpoint ─────────────────────────────────

    /**
     * GET /api/aiModels/external
     * Used by KrAsterisk (and any other external service) to list published models.
     * Requires a valid API key with scope 'models:read'.
     *
     * Returns only publish:true models (same as non-admin JWT).
     */
    @ApiOperation({
        summary: 'List published AI models (API key)',
        description: 'Endpoint for external services. Requires API key with scope models:read.',
    })
    @ApiSecurity('api-key')
    @RequireApiKeyScope(API_KEY_SCOPES.MODELS_READ)
    @UseGuards(ApiKeyGuard)
    @Get('external')
    getPublished() {
        return this.aiModelService.getAll(false); // publish:true only
    }
}
