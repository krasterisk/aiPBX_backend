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
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { WidgetKeysService } from './widget-keys.service';
import { CreateWidgetKeyDto } from './dto/create-widget-key.dto';
import { UpdateWidgetKeyDto } from './dto/update-widget-key.dto';
import { WidgetKey } from './widget-keys.model';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles-auth.decorator';

@ApiTags('Widget Keys')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('ADMIN', 'USER')
@Controller('widget-keys')
export class WidgetKeysController {
    constructor(private readonly widgetKeysService: WidgetKeysService) { }

    @Post('logo')
    @UseInterceptors(FileInterceptor('image'))
    @ApiOperation({ summary: 'Upload widget logo' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                image: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiResponse({ status: 201, description: 'Logo uploaded successfully' })
    async uploadLogo(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
                ],
            }),
        ) file: any,
    ) {
        const filename = await this.widgetKeysService.uploadLogo(file);
        return { logo: filename };
    }

    @Post()
    @ApiOperation({ summary: 'Create a new widget key' })
    @ApiResponse({ status: 201, description: 'Widget key created successfully', type: WidgetKey })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Forbidden - Assistant does not belong to user' })
    @ApiResponse({ status: 404, description: 'Assistant not found' })
    create(@Request() req, @Body() createWidgetKeyDto: CreateWidgetKeyDto): Promise<WidgetKey> {
        return this.widgetKeysService.create(req.tokenUserId, createWidgetKeyDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all widget keys (admin: all, user: own)' })
    @ApiResponse({ status: 200, description: 'List of widget keys', type: [WidgetKey] })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    findAll(@Request() req): Promise<WidgetKey[]> {
        if (req.isAdmin) {
            return this.widgetKeysService.findAll();
        }
        return this.widgetKeysService.findAll(req.tokenUserId);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get a specific widget key by ID' })
    @ApiResponse({ status: 200, description: 'Widget key details', type: WidgetKey })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    findOne(@Request() req, @Param('id') id: string): Promise<WidgetKey> {
        return this.widgetKeysService.findOne(+id, req.tokenUserId);
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
        return this.widgetKeysService.update(+id, req.tokenUserId, updateWidgetKeyDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a widget key' })
    @ApiResponse({ status: 200, description: 'Widget key deleted successfully' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 404, description: 'Widget key not found' })
    remove(@Request() req, @Param('id') id: string): Promise<void> {
        return this.widgetKeysService.remove(+id, req.tokenUserId);
    }
}
