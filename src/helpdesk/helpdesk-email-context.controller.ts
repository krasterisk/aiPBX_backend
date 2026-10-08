import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { HelpdeskEmailContextDto } from './dto/helpdesk-email-context.dto';
import { HelpdeskEmailContextService } from './helpdesk-email-context.service';

@ApiTags('Helpdesk Tools')
@ApiSecurity('api-key')
@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools')
export class HelpdeskEmailContextController {
    constructor(private readonly service: HelpdeskEmailContextService) {}

    @Post('email-project-context')
    @ApiOperation({ summary: 'Read email-matched cabinet/project context (ADMIN-owned helpdesk API key)' })
    getContext(@Body() body: HelpdeskEmailContextDto, @Req() request: { apiKeyUserId?: number }) {
        return this.service.getContext(request.apiKeyUserId, body);
    }
}
