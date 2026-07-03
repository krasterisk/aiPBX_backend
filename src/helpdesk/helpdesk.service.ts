import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op, WhereOptions } from 'sequelize';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';
import { HelpdeskTicketMessage } from './models/helpdesk-ticket-message.model';
import { HelpdeskTicketStatusHistory } from './models/helpdesk-ticket-status-history.model';
import {
    CreateHelpdeskMessageDto,
    CreateHelpdeskTicketDto,
    HelpdeskTicketListQueryDto,
    UpdateHelpdeskTicketDto,
} from './dto/helpdesk-ticket.dto';

@Injectable()
export class HelpdeskService {
    constructor(
        @InjectModel(HelpdeskTicket) private readonly ticketRepo: typeof HelpdeskTicket,
        @InjectModel(HelpdeskTicketMessage) private readonly messageRepo: typeof HelpdeskTicketMessage,
        @InjectModel(HelpdeskTicketStatusHistory)
        private readonly statusHistoryRepo: typeof HelpdeskTicketStatusHistory,
    ) {}

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
                    { clientName: { [Op.iLike]: q } },
                    { inn: { [Op.iLike]: q } },
                    { callerPhone: { [Op.iLike]: q } },
                    { contactPhone: { [Op.iLike]: q } },
                    { subject: { [Op.iLike]: q } },
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

    async create(dto: CreateHelpdeskTicketDto, options?: { createdByApiKeyId?: number }): Promise<HelpdeskTicket> {
        const ticket = await this.ticketRepo.create({
            status: dto.status || 'new',
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
            assigneeId: null,
            createdByApiKeyId: options?.createdByApiKeyId ?? null,
            transcript: dto.transcript ?? null,
        });

        await this.recordStatusChange(ticket.id, null, ticket.status, null, 'Создание заявки');
        return ticket;
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

        return this.findById(id);
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
        return this.findById(id);
    }

    async addMessage(
        ticketId: number,
        dto: CreateHelpdeskMessageDto,
        userId?: number,
    ): Promise<HelpdeskTicketMessage> {
        await this.findById(ticketId);
        return this.messageRepo.create({
            ticketId,
            role: dto.role || 'operator',
            content: dto.content,
            metadata: userId ? { userId } : null,
        });
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
