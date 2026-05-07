import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

interface TokenRequest extends Request {
    tokenUserId?: string;
    isAdmin?: boolean;
}

/**
 * API Keys management.
 * Only authenticated users (JWT) can manage their own keys.
 * ADMIN can view/revoke any key.
 *
 * Keys are created via POST and the raw token is returned ONCE.
 * After that only the prefix is shown in the list.
 */
@ApiTags('API Keys')
@Roles('ADMIN', 'USER')
@UseGuards(RolesGuard)
@Controller('api-keys')
export class ApiKeyController {
    constructor(private readonly apiKeyService: ApiKeyService) {}

    @ApiOperation({
        summary: 'Create an API key',
        description: 'Returns the raw token once. Store it securely — it cannot be retrieved later.',
    })
    @ApiResponse({ status: 201, description: '{ apiKey, rawToken }' })
    @Post()
    async create(@Body() dto: CreateApiKeyDto, @Req() req: TokenRequest) {
        const userId = Number(req.tokenUserId);
        return this.apiKeyService.create(userId, dto);
    }

    @ApiOperation({ summary: 'List API keys for the current user (no token hashes)' })
    @Get()
    async getAll(@Req() req: TokenRequest) {
        const userId = Number(req.tokenUserId);
        return this.apiKeyService.getAll(userId);
    }

    @ApiOperation({ summary: 'Revoke an API key' })
    @Delete(':id')
    async revoke(
        @Param('id', ParseIntPipe) id: number,
        @Req() req: TokenRequest,
    ) {
        const userId = Number(req.tokenUserId);
        const isAdmin = req.isAdmin ?? false;
        await this.apiKeyService.revoke(id, userId, isAdmin);
        return { success: true };
    }
}
