import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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

function resolveUserId(req: { user?: { id?: number } }): number {
    const id = req.user?.id;
    if (!id) {
        throw new Error('User ID not found in request');
    }
    return Number(id);
}

@ApiTags('Helpdesk')
@Controller('helpdesk')
export class HelpdeskController {
    constructor(
        private readonly helpdeskService: HelpdeskService,
        private readonly alfawebhookService: HelpdeskAlfawebhookService,
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
    createTicket(@Body() dto: CreateHelpdeskTicketDto) {
        return this.helpdeskService.create({ ...dto, source: dto.source || 'manual' });
    }

    @ApiOperation({ summary: 'Обновить заявку (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch('tickets/:id')
    updateTicket(
        @Param('id', ParseIntPipe) id: number,
        @Body() dto: UpdateHelpdeskTicketDto,
        @Req() req: { user?: { id?: number } },
    ) {
        return this.helpdeskService.update(id, dto, resolveUserId(req));
    }

    @ApiOperation({ summary: 'Взять заявку из пула (admin, D-19)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post('tickets/:id/claim')
    claimTicket(@Param('id', ParseIntPipe) id: number, @Req() req: { user?: { id?: number } }) {
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
        @Req() req: { user?: { id?: number } },
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
}
