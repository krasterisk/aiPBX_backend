import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { API_KEY_SCOPES, RequireApiKeyScope } from '../api-keys/api-key-scope.decorator';
import { HelpdeskEmailContextDto, HelpdeskIdentityCandidatesDto, HelpdeskBoundSupportDto, HelpdeskReportingSummaryDto } from './dto/helpdesk-email-context.dto';
import { HelpdeskEmailContextService } from './helpdesk-email-context.service';
import { HelpdeskTopicEditDto } from './dto/helpdesk-email-context.dto';

@ApiTags('Helpdesk Tools')
@ApiSecurity('api-key')
@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools')
export class HelpdeskEmailContextController {
    constructor(private readonly service: HelpdeskEmailContextService) {}

    @Post('bound-topic-settings')
    @ApiOperation({summary:'Read scoped call topics and immutable snapshot hash'})
    getTopics(@Body() body:HelpdeskBoundSupportDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.getTopicSettings(request.apiKeyUserId,body);
    }

    @Post('bound-topic-edit')
    @ApiOperation({summary:'Apply one approved partial call-topic edit with stale-state protection'})
    editTopics(@Body() body: HelpdeskTopicEditDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.editTopics(request.apiKeyUserId,body);
    }

    @Post('identity-candidates')
    @ApiOperation({summary:'Find identity candidates without calls, transcripts or credentials'})
    getCandidates(@Body() body:HelpdeskIdentityCandidatesDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.getIdentityCandidates(request.apiKeyUserId,body);
    }
    @Post('bound-support-context')
    @ApiOperation({summary:'Read metadata of an explicitly selected cabinet/project'})
    getBoundSupport(@Body() body:HelpdeskBoundSupportDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.getBoundSupportContext(request.apiKeyUserId,body);
    }
    @Post('bound-reporting-summary')
    @ApiOperation({summary:'Read existing scoped dashboard aggregates without call records, audio or transcripts'})
    getReportingSummary(@Body() body:HelpdeskReportingSummaryDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.getReportingSummary(request.apiKeyUserId,body);
    }

    @Post('analytics-support-context')
    @ApiOperation({summary:'Read scoped analytics capabilities/settings without transcripts or calls'})
    getSupportContext(@Body() body:HelpdeskEmailContextDto,@Req() request:{apiKeyUserId?:number}) {
        return this.service.getSupportContext(request.apiKeyUserId,body);
    }

    @Post('email-project-context')
    @ApiOperation({ summary: 'Read email-matched cabinet/project context (ADMIN-owned helpdesk API key)' })
    getContext(@Body() body: HelpdeskEmailContextDto, @Req() request: { apiKeyUserId?: number }) {
        return this.service.getContext(request.apiKeyUserId, body);
    }
}
