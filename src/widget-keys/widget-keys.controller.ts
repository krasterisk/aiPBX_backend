import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WidgetKeysService } from './widget-keys.service';
import { CreateWidgetKeyDto } from './dto/create-widget-key.dto';
import { UpdateWidgetKeyDto } from './dto/update-widget-key.dto';
import { WidgetKey } from './widget-keys.model';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Widget Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('widget-keys')
export class WidgetKeysController {
    constructor(private readonly widgetKeysService: WidgetKeysService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new widget key' })
    @ApiResponse({ status: 201, description: 'Widget key created successfully', type: WidgetKey })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Assistant does not belong to user' })
    @ApiResponse({ status: 404, description: 'Assistant not found' })
    create(@Request() req, @Body() createWidgetKeyDto: CreateWidgetKeyDto): Promise<WidgetKey> {
        return this.widgetKeysService.create(req.user.id, createWidgetKeyDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all widget keys for authenticated user' })
    @ApiResponse({ status: 200, description: 'List of widget keys', type: [WidgetKey] })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findAll(@Request() req): Promise<WidgetKey[]> {
        return this.widgetKeysService.findAll(req.user.id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific widget key by ID' })
    @ApiResponse({ status: 200, description: 'Widget key details', type: WidgetKey })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    findOne(@Request() req, @Param('id') id: string): Promise<WidgetKey> {
        return this.widgetKeysService.findOne(+id, req.user.id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update a widget key' })
    @ApiResponse({ status: 200, description: 'Widget key updated successfully', type: WidgetKey })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    update(
        @Request() req,
        @Param('id') id: string,
        @Body() updateWidgetKeyDto: UpdateWidgetKeyDto,
    ): Promise<WidgetKey> {
        return this.widgetKeysService.update(+id, req.user.id, updateWidgetKeyDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a widget key' })
    @ApiResponse({ status: 200, description: 'Widget key deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    remove(@Request() req, @Param('id') id: string): Promise<void> {
        return this.widgetKeysService.remove(+id, req.user.id);
    }
}
