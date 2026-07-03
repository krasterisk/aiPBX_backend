import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { RequireApiKeyScope, API_KEY_SCOPES } from '../api-keys/api-key-scope.decorator';
import { HelpdeskToolsService } from './helpdesk-tools.service';
import {
    HelpdeskToolsAddMessageDto,
    HelpdeskToolsCreateTicketDto,
    HelpdeskToolsHangupDto,
    HelpdeskToolsIdentifyDto,
    HelpdeskToolsClientRefDto,
    HelpdeskToolsPbxClientDto,
    HelpdeskToolsPromisedPaymentDto,
} from './dto/helpdesk-tools.dto';

interface ApiKeyRequest {
    apiKey?: { id: number };
    apiKeyUserId?: number;
}

@ApiTags('Helpdesk Tools')
@ApiSecurity('api-key')
@RequireApiKeyScope(API_KEY_SCOPES.HELPDESK_TOOLS)
@UseGuards(ApiKeyGuard)
@Controller('helpdesk/tools')
export class HelpdeskToolsController {
    constructor(private readonly toolsService: HelpdeskToolsService) {}

    @ApiOperation({ summary: 'Идентификация клиента (AI)' })
    @Post('identify-client')
    identifyClient(@Body() body: HelpdeskToolsIdentifyDto) {
        return this.toolsService.identifyClient(body);
    }

    @ApiOperation({ summary: 'Информация о клиенте (AI)' })
    @Post('get-client-info')
    getClientInfo(@Body() body: HelpdeskToolsClientRefDto) {
        return this.toolsService.getClientInfo(body);
    }

    @ApiOperation({ summary: 'LLM-контекст клиента (AI)' })
    @Post('get-llm-context')
    getLlmContext(@Body() body: HelpdeskToolsClientRefDto) {
        return this.toolsService.getLlmContext(body);
    }

    @ApiOperation({ summary: 'Создать заявку (AI)' })
    @Post('create-ticket')
    createTicket(@Body() body: HelpdeskToolsCreateTicketDto, @Req() req: ApiKeyRequest) {
        return this.toolsService.createTicket(body, req.apiKey?.id);
    }

    @ApiOperation({ summary: 'Добавить сообщение к заявке (AI)' })
    @Post('add-message')
    addMessage(@Body() body: HelpdeskToolsAddMessageDto) {
        return this.toolsService.addMessage(body);
    }

    @ApiOperation({ summary: 'PBX: данные vpbx_user (AI)' })
    @Post('pbx-get-vpbx-user')
    pbxGetVpbxUser(@Body() body: HelpdeskToolsPbxClientDto) {
        return this.toolsService.getVpbxUser(body.clientId);
    }

    @ApiOperation({ summary: 'PBX: SIP-регистрации (AI)' })
    @Post('pbx-list-sip-registrations')
    pbxListSipRegistrations(@Body() body: HelpdeskToolsPbxClientDto) {
        return this.toolsService.listSipRegistrations(body.clientId);
    }

    @ApiOperation({ summary: 'PBX: обещанный платёж (AI)' })
    @Post('pbx-promised-payment')
    pbxPromisedPayment(@Body() body: HelpdeskToolsPromisedPaymentDto) {
        return this.toolsService.promisedPayment(body.clientId, body.days);
    }

    @ApiOperation({ summary: 'PBX: завершить канал (AI)' })
    @Post('pbx-hangup-channel')
    pbxHangupChannel(@Body() body: HelpdeskToolsHangupDto) {
        return this.toolsService.hangupChannel(body.clientId, body.channelId, body.confirm);
    }
}
