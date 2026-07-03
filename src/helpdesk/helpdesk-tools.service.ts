import { BadRequestException, Injectable } from '@nestjs/common';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskAlfawebhookService } from './helpdesk-alfawebhook.service';
import { HelpdeskLlmContextService } from './helpdesk-llm-context.service';
import { HelpdeskPbxAgentService } from './helpdesk-pbx-agent.service';
import {
    HelpdeskToolsAddMessageDto,
    HelpdeskToolsCreateTicketDto,
    HelpdeskToolsIdentifyDto,
    HelpdeskToolsClientRefDto,
} from './dto/helpdesk-tools.dto';

@Injectable()
export class HelpdeskToolsService {
    constructor(
        private readonly helpdeskService: HelpdeskService,
        private readonly alfawebhookService: HelpdeskAlfawebhookService,
        private readonly llmContextService: HelpdeskLlmContextService,
        private readonly pbxAgentService: HelpdeskPbxAgentService,
    ) {}

    identifyClient(dto: HelpdeskToolsIdentifyDto) {
        return this.alfawebhookService.identifyClient(dto);
    }

    async getClientInfo(dto: HelpdeskToolsClientRefDto) {
        if (dto.inn) {
            const client = await this.alfawebhookService.getClientByInn(dto.inn);
            return { found: !!client, client };
        }
        if (dto.clientId) {
            const client = await this.alfawebhookService.getClientById(dto.clientId);
            return { found: !!client, client };
        }
        throw new BadRequestException('clientId or inn required');
    }

    async getLlmContext(dto: HelpdeskToolsClientRefDto) {
        const ctx = await this.llmContextService.getContext(dto);
        if (!ctx) {
            return { found: false, message: 'Контекст не найден' };
        }
        return { found: true, rawMarkdown: ctx.rawMarkdown, json: ctx.json };
    }

    createTicket(dto: HelpdeskToolsCreateTicketDto, apiKeyId?: number) {
        return this.helpdeskService.create(
            {
                subject: dto.subject,
                category: dto.category,
                priority: dto.priority,
                callerPhone: dto.callerPhone,
                contactPhone: dto.contactPhone,
                clientName: dto.clientName,
                alfawebhookClientId: dto.alfawebhookClientId,
                inn: dto.inn,
                description: dto.description,
                transcript: dto.transcript,
                source: dto.source || 'ai_voice',
                status: 'new',
            },
            { createdByApiKeyId: apiKeyId },
        );
    }

    addMessage(dto: HelpdeskToolsAddMessageDto) {
        return this.helpdeskService.addMessage(dto.ticketId, {
            role: dto.role || 'user',
            content: dto.content,
        });
    }

    getVpbxUser(clientId: string) {
        return this.pbxAgentService.getVpbxUser(clientId);
    }

    listSipRegistrations(clientId: string) {
        return this.pbxAgentService.listSipRegistrations(clientId);
    }

    promisedPayment(clientId: string, days?: number) {
        return this.pbxAgentService.promisedPayment(clientId, days);
    }

    hangupChannel(clientId: string, channelId: string, confirm: boolean) {
        return this.pbxAgentService.hangupChannel(clientId, channelId, confirm);
    }

    async handleBuiltinTool(handler: string, args: Record<string, unknown>, apiKeyId?: number): Promise<unknown> {
        switch (handler) {
            case 'helpdesk_identify_client':
                return this.identifyClient(args as HelpdeskToolsIdentifyDto);
            case 'helpdesk_get_client_info':
                return this.getClientInfo(args as HelpdeskToolsClientRefDto);
            case 'helpdesk_get_llm_context':
                return this.getLlmContext(args as HelpdeskToolsClientRefDto);
            case 'helpdesk_create_ticket':
                return this.createTicket(args as unknown as HelpdeskToolsCreateTicketDto, apiKeyId);
            case 'helpdesk_add_message':
                return this.addMessage(args as unknown as HelpdeskToolsAddMessageDto);
            case 'helpdesk_pbx_get_vpbx_user':
                return this.getVpbxUser(String(args.clientId));
            case 'helpdesk_pbx_list_sip_registrations':
                return this.listSipRegistrations(String(args.clientId));
            case 'helpdesk_pbx_promised_payment':
                return this.promisedPayment(String(args.clientId), Number(args.days || 2));
            case 'helpdesk_pbx_hangup_channel':
                return this.hangupChannel(String(args.clientId), String(args.channelId), args.confirm === true);
            default:
                throw new BadRequestException(`Unknown helpdesk handler: ${handler}`);
        }
    }
}
