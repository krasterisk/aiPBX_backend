import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { MailerService } from '../mailer/mailer.service';
import { TelegramService } from '../telegram/telegram.service';
import { HelpdeskSettings } from './models/helpdesk-settings.model';
import { HelpdeskTicket } from './models/helpdesk-ticket.model';

@Injectable()
export class HelpdeskNotificationService {
    private readonly logger = new Logger(HelpdeskNotificationService.name);

    constructor(
        @InjectModel(HelpdeskSettings) private readonly settingsRepo: typeof HelpdeskSettings,
        private readonly mailerService: MailerService,
        private readonly telegramService: TelegramService,
    ) {}

    async notifyNewUnassignedTicket(ticket: HelpdeskTicket): Promise<void> {
        if (ticket.assigneeId != null) {
            return;
        }

        const settings = await this.getSettings();
        const emails = settings.notificationEmails || [];
        const chatIds = settings.notificationTelegramChatIds || [];

        if (!emails.length && !chatIds.length) {
            return;
        }

        const adminBase = process.env.FRONTEND_URL || 'https://app.aipbx.ru';
        const link = `${adminBase}/admin/helpdesk/${ticket.id}`;
        const subject = `[Helpdesk] Новая заявка #${ticket.id}: ${ticket.subject}`;
        const bodyText = [
            `Заявка #${ticket.id}`,
            `Клиент: ${ticket.clientName || 'не идентифицирован'}`,
            `Категория: ${ticket.category}`,
            `Приоритет: ${ticket.priority}`,
            `Телефон: ${ticket.callerPhone || ticket.contactPhone || '—'}`,
            `Ссылка: ${link}`,
        ].join('\n');

        const html = `
            <p><strong>Новая заявка #${ticket.id}</strong></p>
            <p>Клиент: ${ticket.clientName || 'не идентифицирован'}</p>
            <p>Категория: ${ticket.category}, приоритет: ${ticket.priority}</p>
            <p><a href="${link}">Открыть в админке</a></p>
        `;

        for (const email of emails) {
            try {
                await this.sendSimpleEmail(email, subject, html, bodyText);
            } catch (e) {
                this.logger.error(`Helpdesk email to ${email} failed: ${e.message}`);
            }
        }

        const tgMessage = `🎫 ${subject}\n${bodyText}`;
        for (const chatId of chatIds) {
            try {
                await this.telegramService.sendMessage(tgMessage, undefined, chatId);
            } catch (e) {
                this.logger.error(`Helpdesk Telegram to ${chatId} failed: ${e.message}`);
            }
        }
    }

        private async sendSimpleEmail(to: string, subject: string, html: string, text: string): Promise<void> {
        await this.mailerService.sendHelpdeskNotification(to, subject, html, text);
    }

    private async getSettings(): Promise<HelpdeskSettings> {
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
}
