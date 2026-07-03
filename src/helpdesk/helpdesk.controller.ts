import {
    Body,
    Controller,
    Get,
    HttpException,
    HttpStatus,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';
import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';
import {
    CreateHelpdeskMessageDto,
    CreateHelpdeskTicketDto,
    HelpdeskTicketListQueryDto,
    UpdateHelpdeskTicketDto,
} from './dto/helpdesk-ticket.dto';
import { HelpdeskIdentifyBodyDto, HelpdeskIdentifyResultDto } from './dto/alfawebhook-client.dto';
import { UpdateHelpdeskSettingsDto } from './dto/helpdesk-settings.dto';
import { HelpdeskLlmContextOverrideDto } from './dto/helpdesk-tools.dto';
import { HelpdeskLlmContextService } from './helpdesk-llm-context.service';
import { HelpdeskSettings } from './models/helpdesk-settings.model';

interface RequestWithUser extends Request {
    tokenUserId?: string;
    vpbxUserId?: string | null;
    isAdmin?: boolean;
}

/** RolesGuard sets tokenUserId from JWT user.id (not req.user). */
function resolveUserId(req: RequestWithUser): number {
    const raw = req.tokenUserId;
    if (!raw) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    return Number(raw);
}

@ApiTags('Helpdesk')
@Controller('helpdesk')
export class HelpdeskController {
    constructor(
        private readonly helpdeskService: HelpdeskService,
        private readonly alfawebhookService: HelpdeskAlfawebhookService,
        private readonly llmContextService: HelpdeskLlmContextService,
    ) {}

    @ApiOperation({ summary: 'Список заявок (admin)' })
    @ApiResponse({ status: 200, type: [HelpdeskTicket] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('tickets')
    listTickets(@Query() query: HelpdeskTicketListQueryDto) {
        return this.helpdeskService.findAll(query);
    }

    @ApiOperation({ summary: 'Детали заявки (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('tickets/:id')
    getTicket(@Param('id', ParseIntPipe) id: number) {
        return this.helpdeskService.findById(id);
    }

    @ApiOperation({ summary: 'Создать заявку вручную (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('tickets')
    createTicket(@Body() dto: CreateHelpdeskTicketDto, @Req() req: RequestWithUser) {
        const userId = resolveUserId(req);
        return this.helpdeskService.create(
            { ...dto, source: dto.source || 'manual' },
            { assigneeId: userId, operatorUserId: userId },
        );
    }

    @ApiOperation({ summary: 'Обновить заявку (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch('tickets/:id')
    updateTicket(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHelpdeskTicketDto,
        @Req() req: RequestWithUser,
    ) {
        return this.helpdeskService.update(id, dto, resolveUserId(req));
    }

    @ApiOperation({ summary: 'Взять заявку из пула (admin, D-19)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('tickets/:id/claim')
    claimTicket(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
        return this.helpdeskService.claim(id, resolveUserId(req));
    }

    @ApiOperation({ summary: 'Добавить сообщение к заявке (admin)' })
    @ApiResponse({ status: 201, type: HelpdeskTicketMessage })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('tickets/:id/messages')
    addMessage(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: CreateHelpdeskMessageDto,
        @Req() req: RequestWithUser,
    ) {
        return this.helpdeskService.addMessage(id, dto, resolveUserId(req));
    }

    @ApiOperation({ summary: 'Идентификация клиента через alfawebhook (admin preview)' })
    @ApiResponse({ status: 200, type: HelpdeskIdentifyResultDto })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('clients/identify')
    identifyClient(@Body() body: HelpdeskIdentifyBodyDto): Promise<HelpdeskIdentifyResultDto> {
        return this.alfawebhookService.identifyClient(body);
    }

    @ApiOperation({ summary: 'Настройки helpdesk (admin)' })
    @ApiResponse({ status: 200, type: HelpdeskSettings })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('settings')
    getSettings() {
        return this.helpdeskService.getSettings();
    }

    @ApiOperation({ summary: 'Обновить настройки helpdesk (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch('settings')
    updateSettings(@Body() dto: UpdateHelpdeskSettingsDto) {
        return this.helpdeskService.updateSettings(dto);
    }

    @ApiOperation({ summary: 'LLM-контекст клиента (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('clients/:clientKey/llm-context')
    getLlmContext(@Param('clientKey') clientKey: string) {
        return this.llmContextService.getContextByKey(decodeURIComponent(clientKey));
    }

    @ApiOperation({ summary: 'Переопределение LLM-контекста оператором (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch('clients/:clientKey/llm-context')
    updateLlmContextOverride(
        @Param('clientKey') clientKey: string,
        @Body() dto: HelpdeskLlmContextOverrideDto,
    ) {
        return this.llmContextService.updateOperatorOverride(
            decodeURIComponent(clientKey),
            dto.markdownOverride ?? null,
        );
    }
}
