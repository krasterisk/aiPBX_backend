import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { HelpdeskClientContext } from './models/helpdesk-client-context.model';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';
import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';

export interface HelpdeskLlmContextView {
    clientKey: string;
    summaryMarkdown: string;
    rawMarkdown: string;
    json: Record<string, unknown>;
}

@Injectable()
export class HelpdeskLlmContextService {
    private readonly logger = new Logger(HelpdeskLlmContextService.name);

    constructor(
        @InjectModel(HelpdeskClientContext)
        private readonly contextRepo: typeof HelpdeskClientContext,
        @InjectModel(HelpdeskTicket) private readonly ticketRepo: typeof HelpdeskTicket,
        @InjectModel(HelpdeskTicketMessage) private readonly messageRepo: typeof HelpdeskTicketMessage,
    ) {}

    resolveClientKey(params: { clientId?: string; inn?: string }): string | null {
        if (params.clientId?.trim()) {
            return `aw:${params.clientId.trim()}`;
        }
        if (params.inn?.trim()) {
            return `inn:${params.inn.trim()}`;
        }
        return null;
    }

    resolveClientKeyFromTicket(ticket: HelpdeskTicket): string | null {
        if (ticket.alfawebhookClientId) {
            return `aw:${ticket.alfawebhookClientId}`;
        }
        if (ticket.inn) {
            return `inn:${ticket.inn}`;
        }
        if (ticket.clientName) {
            return `name:${ticket.clientName.trim().toLowerCase()}`;
        }
        return null;
    }

    async getContext(params: { clientId?: string; inn?: string }): Promise<HelpdeskLlmContextView | null> {
        const clientKey = this.resolveClientKey(params);
        if (!clientKey) {
            return null;
        }
        const row = await this.contextRepo.findOne({ where: { clientKey } });
        if (!row) {
            return null;
        }
        return this.toView(row);
    }

    async getContextByKey(clientKey: string): Promise<HelpdeskLlmContextView> {
        const row = await this.contextRepo.findOne({ where: { clientKey } });
        if (!row) {
            throw new NotFoundException('Контекст клиента не найден');
        }
        return this.toView(row);
    }

    async updateOperatorOverride(clientKey: string, markdownOverride: string | null): Promise<HelpdeskLlmContextView> {
        let row = await this.contextRepo.findOne({ where: { clientKey } });
        if (!row) {
            row = await this.contextRepo.create({
                clientKey,
                alfawebhookClientId: clientKey.startsWith('aw:') ? clientKey.slice(3) : null,
                inn: clientKey.startsWith('inn:') ? clientKey.slice(4) : null,
                contextJson: {},
                contextMarkdown: '',
                contextMarkdownOverride: markdownOverride,
            });
        } else {
            row.contextMarkdownOverride = markdownOverride;
            await row.save();
        }
        return this.toView(row);
    }

    async upsertFromTicketEvent(ticket: HelpdeskTicket): Promise<void> {
        const clientKey = this.resolveClientKeyFromTicket(ticket);
        if (!clientKey) {
            return;
        }

        const orConditions: WhereOptions<HelpdeskTicket>[] = [];
        if (ticket.alfawebhookClientId) {
            orConditions.push({ alfawebhookClientId: ticket.alfawebhookClientId });
        }
        if (ticket.inn) {
            orConditions.push({ inn: ticket.inn });
        }

        const relatedTickets = orConditions.length
            ? await this.ticketRepo.findAll({
                where: { [Op.or]: orConditions },
                order: [['updatedAt', 'DESC']],
                limit: 20,
            })
            : [ticket];

        const ticketIds = relatedTickets.map((t) => t.id);
        const messages = ticketIds.length
            ? await this.messageRepo.findAll({
                where: { ticketId: { [Op.in]: ticketIds } },
                order: [['createdAt', 'DESC']],
                limit: 50,
            })
            : [];

        const contextJson: Record<string, unknown> = {
            clientKey,
            clientName: ticket.clientName,
            inn: ticket.inn,
            alfawebhookClientId: ticket.alfawebhookClientId,
            tickets: relatedTickets.map((t) => ({
                id: t.id,
                status: t.status,
                category: t.category,
                priority: t.priority,
                subject: t.subject,
                updatedAt: t.updatedAt,
            })),
            recentMessages: messages.map((m) => ({
                ticketId: m.ticketId,
                role: m.role,
                content: m.content?.slice(0, 500),
                createdAt: m.createdAt,
            })),
            lastUpdated: new Date().toISOString(),
        };

        const contextMarkdown = this.regenerateMarkdown(contextJson);

        const existing = await this.contextRepo.findOne({ where: { clientKey } });
        if (existing) {
            existing.contextJson = contextJson;
            existing.contextMarkdown = contextMarkdown;
            existing.alfawebhookClientId = ticket.alfawebhookClientId ?? existing.alfawebhookClientId;
            existing.inn = ticket.inn ?? existing.inn;
            await existing.save();
        } else {
            await this.contextRepo.create({
                clientKey,
                alfawebhookClientId: ticket.alfawebhookClientId ?? null,
                inn: ticket.inn ?? null,
                contextJson,
                contextMarkdown,
                contextMarkdownOverride: null,
            });
        }
    }

    regenerateMarkdown(json: Record<string, unknown>): string {
        const tickets = (json.tickets as Array<Record<string, unknown>>) || [];
        const messages = (json.recentMessages as Array<Record<string, unknown>>) || [];
        const lines: string[] = [
            `# Контекст клиента`,
            '',
            `**Клиент:** ${json.clientName || '—'}`,
            `**ИНН:** ${json.inn || '—'}`,
            '',
            `## Заявки (${tickets.length})`,
        ];

        for (const t of tickets.slice(0, 10)) {
            lines.push(`- #${t.id} [${t.status}] ${t.subject} (${t.category}, ${t.priority})`);
        }

        if (messages.length) {
            lines.push('', '## Последние сообщения');
            for (const m of messages.slice(0, 8)) {
                lines.push(`- [${m.role}] #${m.ticketId}: ${m.content}`);
            }
        }

        return lines.join('\n');
    }

    private toView(row: HelpdeskClientContext): HelpdeskLlmContextView {
        const rawMarkdown = row.contextMarkdownOverride ?? row.contextMarkdown;
        return {
            clientKey: row.clientKey,
            summaryMarkdown: row.contextMarkdown,
            rawMarkdown,
            json: row.contextJson || {},
        };
    }
}
