import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';
import { TopicSchemeService } from './topic-scheme.service';

const schemeSchema: SchemaObject = {
    type: 'object', additionalProperties: false, required: ['version', 'topics', 'fallbackTopicId'],
    properties: {
        version: { type: 'integer', enum: [1] },
        fallbackTopicId: { type: 'string', maxLength: 50 },
        topics: { type: 'array', minItems: 2, maxItems: 20, description: 'Priority order; fallback is selected only if no other topic matches.',
            items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'when', 'exclude', 'examples'], properties: {
                id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$' },
                name: { type: 'string', minLength: 1, maxLength: 100 },
                when: { type: 'string', maxLength: 6000 }, exclude: { type: 'string', maxLength: 6000 },
                examples: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 1000 } },
            } } },
    },
};

@ApiTags('Operator Analytics')
@ApiBearerAuth()
@Roles('ADMIN', 'USER')
@UseGuards(RolesGuard)
@ApiParam({ name: 'id', type: Number, description: 'Project id. Access is scoped to the authenticated owner or administrator.' })
@ApiResponse({ status: 400, description: 'Invalid scheme, failed checks or missing topic coverage.' })
@ApiResponse({ status: 404, description: 'Project not accessible to this account.' })
@ApiResponse({ status: 409, description: 'Draft/project changed or another check is running; reload before retrying.' })
@Controller('operator-analytics/projects/:id/topic-scheme')
export class TopicSchemeController {
    constructor(private readonly service: TopicSchemeService) {}

    @Get()
    @ApiOperation({ summary: 'Read active topic scheme, pending draft and up to 20 applied versions' })
    read(@Param('id') id: string, @Req() req: any) {
        return this.service.read(Number(id), req.vpbxUserId || req.tokenUserId, req.isAdmin === true);
    }

    @Post('draft')
    @ApiOperation({ summary: 'Save a new unchecked draft using optimistic concurrency' })
    @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['scheme', 'expectedDraftRevision'], properties: {
        scheme: schemeSchema, expectedDraftRevision: { type: 'string', format: 'uuid', nullable: true },
        businessContext: { type: 'string', nullable: true, maxLength: 60000,
            description: 'Optional legacy context cleanup. Checked and activated atomically with this draft; omission preserves current context.' },
    } } })
    draft(@Param('id') id: string, @Req() req: any, @Body() body: unknown) {
        return this.service.draft(Number(id), req.vpbxUserId || req.tokenUserId, req.isAdmin === true, body);
    }

    @Post('check')
    @ApiOperation({ summary: 'Preview full analysis without changing call analyses or billing records',
        description: 'Text is sent to configured analytics providers. Draft/history store hashes and outcomes, never the test transcript. All labelled checks must match and cover every topic before apply.' })
    @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['revision', 'cases'], properties: {
        revision: { type: 'string', format: 'uuid' }, cases: { type: 'array', minItems: 1, maxItems: 100,
            items: { type: 'object', additionalProperties: false, required: ['text'], properties: {
                text: { type: 'string', minLength: 10, maxLength: 60000 }, expectedTopicId: { type: 'string', minLength: 1, maxLength: 50 },
            } } },
    } } })
    check(@Param('id') id: string, @Req() req: any, @Body() body: unknown) {
        return this.service.check(Number(id), req.vpbxUserId || req.tokenUserId, req.isAdmin === true, body);
    }

    @Post('apply')
    @ApiOperation({ summary: 'Activate an unchanged, successfully checked draft for future analyses' })
    @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['revision'], properties: {
        revision: { type: 'string', format: 'uuid' },
    } } })
    apply(@Param('id') id: string, @Req() req: any, @Body() body: { revision: string }) {
        return this.service.apply(Number(id), req.vpbxUserId || req.tokenUserId, req.isAdmin === true, body?.revision);
    }
}
