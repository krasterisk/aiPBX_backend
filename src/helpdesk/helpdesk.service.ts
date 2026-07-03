import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/sequelize';

import { Op, WhereOptions } from 'sequelize';

import { HelpdeskTicket } from './models/helpdesk-ticket.model';

import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';

import { HelpdeskTicketStatusHistory } from './models/helpdesk-ticket-status-history.model';

import { HelpdeskSettings } from './models/helpdesk-settings.model';

import {

    CreateHelpdeskMessageDto,

    CreateHelpdeskTicketDto,

    HelpdeskTicketListQueryDto,

    UpdateHelpdeskTicketDto,

} from './dto/helpdesk-ticket.dto';

import { UpdateHelpdeskSettingsDto } from './dto/helpdesk-settings.dto';

import { HelpdeskLlmContextService } from './helpdesk-llm-context.service';

import { HelpdeskNotificationService } from './helpdesk-notification.service';



@Injectable()

export class HelpdeskService {

    private readonly logger = new Logger(HelpdeskService.name);



    constructor(

        @InjectModel(HelpdeskTicket) private readonly ticketRepo: typeof HelpdeskTicket,

        @InjectModel(HelpdeskTicketMessage) private readonly messageRepo: typeof HelpdeskTicketMessage,

        @InjectModel(HelpdeskTicketStatusHistory)

        private readonly statusHistoryRepo: typeof HelpdeskTicketStatusHistory,

        @InjectModel(HelpdeskSettings) private readonly settingsRepo: typeof HelpdeskSettings,

        private readonly llmContextService: HelpdeskLlmContextService,

        private readonly notificationService: HelpdeskNotificationService,

    ) {}



    async getSettings(): Promise<HelpdeskSettings> {

        let row = await this.settingsRepo.findByPk(1);

        if (!row) {

            row = await this.settingsRepo.create({

                id: 1,

                notificationEmails: [],

                notificationTelegramChatIds: [],

            });

        }

        return row;

    }



    async updateSettings(dto: UpdateHelpdeskSettingsDto): Promise<HelpdeskSettings> {

        const row = await this.getSettings();

        if (dto.notificationEmails !== undefined) {

            row.notificationEmails = dto.notificationEmails;

        }

        if (dto.notificationTelegramChatIds !== undefined) {

            row.notificationTelegramChatIds = dto.notificationTelegramChatIds;

        }

        await row.save();

        return row;

    }



    async findAll(query: HelpdeskTicketListQueryDto): Promise<HelpdeskTicket[]> {

        const where: WhereOptions<HelpdeskTicket> = {};



        if (query.status) {

            where.status = query.status;

        }

        if (query.category) {

            where.category = query.category;

        }

        if (query.priority) {

            where.priority = query.priority;

        }

        if (query.assigneeId === 'null' || query.assigneeId === '') {

            where.assigneeId = null;

        } else if (query.assigneeId) {

            where.assigneeId = Number(query.assigneeId);

        }



        if (query.q?.trim()) {

            const q = `%${query.q.trim()}%`;

            Object.assign(where, {

                [Op.or]: [

                    { clientName: { [Op.like]: q } },

                    { inn: { [Op.like]: q } },

                    { callerPhone: { [Op.like]: q } },

                    { contactPhone: { [Op.like]: q } },

                    { subject: { [Op.like]: q } },

                ],

            });

        }



        return this.ticketRepo.findAll({

            where,

            order: [['createdAt', 'DESC']],

        });

    }



    async findById(id: number): Promise<HelpdeskTicket> {

        const ticket = await this.ticketRepo.findByPk(id, {

            include: [

                { model: HelpdeskTicketMessage, separate: true, order: [['createdAt', 'ASC']] },

                { model: HelpdeskTicketStatusHistory, separate: true, order: [['createdAt', 'ASC']] },

            ],

        });

        if (!ticket) {

            throw new NotFoundException('Заявка не найдена');

        }

        return ticket;

    }



    async create(
        dto: CreateHelpdeskTicketDto,
        options?: {
            createdByApiKeyId?: number;
            assigneeId?: number;
            operatorUserId?: number;
        },
    ): Promise<HelpdeskTicket> {
        const hasAssignee = options?.assigneeId != null;
        const status = hasAssignee ? 'in_progress' : (dto.status || 'new');

        const ticket = await this.ticketRepo.create({
            status,
            category: dto.category || 'other',
            priority: dto.priority || 'normal',
            source: dto.source || 'manual',
            subject: dto.subject?.trim() || 'Без темы',
            description: dto.description ?? null,
            callerPhone: dto.callerPhone ?? null,
            contactPhone: dto.contactPhone ?? null,
            alfawebhookClientId: dto.alfawebhookClientId ?? null,
            inn: dto.inn ?? null,
            clientName: dto.clientName ?? null,
            assigneeId: options?.assigneeId ?? null,
            createdByApiKeyId: options?.createdByApiKeyId ?? null,
            transcript: dto.transcript ?? null,
        });

        await this.recordStatusChange(
            ticket.id,
            null,
            status,
            options?.operatorUserId ?? null,
            hasAssignee ? 'Создание заявки (назначена создателю)' : 'Создание заявки',
        );

        if (dto.description?.trim() && options?.operatorUserId) {
            await this.addMessage(
                ticket.id,
                { content: dto.description.trim(), role: 'operator' },
                options.operatorUserId,
            );
        }

        const created = await this.findById(ticket.id);
        void this.afterTicketEvent(created, 'create');
        return created;
    }



    async update(id: number, dto: UpdateHelpdeskTicketDto, userId?: number): Promise<HelpdeskTicket> {

        const ticket = await this.findById(id);

        const prevStatus = ticket.status;



        if (dto.status !== undefined) ticket.status = dto.status;

        if (dto.category !== undefined) ticket.category = dto.category;

        if (dto.priority !== undefined) ticket.priority = dto.priority;

        if (dto.subject !== undefined) ticket.subject = dto.subject;

        if (dto.description !== undefined) ticket.description = dto.description;

        if (dto.transcript !== undefined) ticket.transcript = dto.transcript;

        if (dto.assigneeId !== undefined) ticket.assigneeId = dto.assigneeId;



        await ticket.save();



        if (dto.status !== undefined && dto.status !== prevStatus) {

            await this.recordStatusChange(ticket.id, prevStatus, dto.status, userId ?? null);

        }



        const updated = await this.findById(id);

        if (dto.status === 'resolved' || dto.status === 'closed') {

            void this.afterTicketEvent(updated, 'close');

        } else {

            void this.afterTicketEvent(updated, 'update');

        }

        return updated;

    }



    async claim(id: number, userId: number): Promise<HelpdeskTicket> {

        const ticket = await this.findById(id);

        if (ticket.assigneeId != null) {

            throw new ConflictException('Заявка уже назначена другому оператору');

        }

        ticket.assigneeId = userId;

        await ticket.save();

        await this.recordStatusChange(

            ticket.id,

            ticket.status,

            ticket.status === 'new' ? 'in_progress' : ticket.status,

            userId,

            'Оператор взял заявку в работу',

        );

        if (ticket.status === 'new') {

            ticket.status = 'in_progress';

            await ticket.save();

        }

        const updated = await this.findById(id);

        void this.afterTicketEvent(updated, 'update');

        return updated;

    }



    async addMessage(

        ticketId: number,

        dto: CreateHelpdeskMessageDto,

        userId?: number,

    ): Promise<HelpdeskTicketMessage> {

        const ticket = await this.findById(ticketId);

        const message = await this.messageRepo.create({

            ticketId,

            role: dto.role || 'operator',

            content: dto.content,

            metadata: userId ? { userId } : null,

        });

        if (dto.role === 'operator' || !dto.role) {

            void this.afterTicketEvent(ticket, 'operator_message');

        }

        return message;

    }



    private async afterTicketEvent(ticket: HelpdeskTicket, kind: 'create' | 'update' | 'close' | 'operator_message'): Promise<void> {

        try {

            await this.llmContextService.upsertFromTicketEvent(ticket);

        } catch (e) {

            this.logger.error(`LLM context update failed: ${e.message}`);

        }



        if (kind === 'create' && ticket.assigneeId == null) {

            try {

                await this.notificationService.notifyNewUnassignedTicket(ticket);

            } catch (e) {

                this.logger.error(`Notification failed: ${e.message}`);

            }

        }

    }



    private async recordStatusChange(

        ticketId: number,

        fromStatus: string | null,

        toStatus: string,

        changedByUserId: number | null,

        note?: string,

    ): Promise<void> {

        await this.statusHistoryRepo.create({

            ticketId,

            fromStatus,

            toStatus,

            changedByUserId,

            note: note ?? null,

            createdAt: new Date(),

        });

    }

}


