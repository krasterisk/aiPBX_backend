import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OperatorProject } from './operator-project.model';
import { MailerService } from '../mailer/mailer.service';
import { TelegramService } from '../telegram/telegram.service';
import {
    normalizeAlertConfig,
    resolveAlertRecipients,
    type AlertConfig,
    type AlertRecipients,
} from './interfaces/alert-config.interface';
import { normalizeDigestConfig } from './interfaces/digest-config.interface';
import {
    buildCriticalAlertMail,
    buildCriticalAlertTelegramCaption,
    type AnomalyAlertNumbers,
    type BudgetAlertNumbers,
    type CriticalAlertMailPayload,
    type CriticalAlertType,
} from './lib/alert-mail.templates';
import { buildBillingMailAttachments } from '../mailer/billing-mail.attachments';

const TEST_COOLDOWN_MS = 5 * 60 * 1000;

@Injectable()
export class OperatorAlertService {
    private readonly logger = new Logger(OperatorAlertService.name);

    constructor(
        @InjectModel(OperatorProject) private readonly projectRepository: typeof OperatorProject,
        private readonly mailerService: MailerService,
        private readonly telegramService: TelegramService,
    ) {}

    resolveRecipients(project: OperatorProject, alertConfig?: AlertConfig): AlertRecipients {
        const cfg = alertConfig ?? normalizeAlertConfig(project.alertConfig);
        const digest = normalizeDigestConfig(project.digestConfig);
        return resolveAlertRecipients(
            cfg,
            digest.emails,
            digest.telegramChatIds,
            project.budgetAlertEmails,
        );
    }

    async sendCriticalAlert(params: {
        type: CriticalAlertType;
        project: OperatorProject;
        anomaly?: AnomalyAlertNumbers;
        budget?: BudgetAlertNumbers;
        /** When true, skip if no recipients (returns zeros). */
        allowEmpty?: boolean;
    }): Promise<{ emailed: number; telegram: number }> {
        const recipients = this.resolveRecipients(params.project);
        if (!recipients.emails.length && !recipients.telegramChatIds.length) {
            if (params.allowEmpty) return { emailed: 0, telegram: 0 };
            this.logger.warn(
                `Critical alert ${params.type} for project #${params.project.id}: no recipients`,
            );
            return { emailed: 0, telegram: 0 };
        }

        const payload = this.buildPayload(params);
        return this.deliver(payload, recipients);
    }

    async sendTestAlert(
        projectId: number,
        userId: string,
        isAdmin: boolean,
    ): Promise<{ ok: true; emailed: number; telegram: number }> {
        const project = await this.projectRepository.findOne({
            where: isAdmin ? { id: projectId } : { id: projectId, userId },
        });
        if (!project) throw new HttpException('Project not found', HttpStatus.NOT_FOUND);

        const cfg = normalizeAlertConfig(project.alertConfig);
        if (!cfg.enabled) {
            throw new HttpException('Critical alerts are disabled for this project', HttpStatus.BAD_REQUEST);
        }

        const recipients = this.resolveRecipients(project, cfg);
        if (!recipients.emails.length && !recipients.telegramChatIds.length) {
            throw new HttpException(
                'No alert recipients configured (set emails/Telegram or inherit from digest)',
                HttpStatus.BAD_REQUEST,
            );
        }

        const last = cfg.lastTestSentAt ? new Date(cfg.lastTestSentAt).getTime() : 0;
        if (last && Date.now() - last < TEST_COOLDOWN_MS) {
            const waitSec = Math.ceil((TEST_COOLDOWN_MS - (Date.now() - last)) / 1000);
            throw new HttpException(
                `Test alert rate limit: try again in ${waitSec}s`,
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        const payload = this.buildPayload({ type: 'test', project });
        const result = await this.deliver(payload, recipients);
        if (result.emailed === 0 && result.telegram === 0) {
            throw new HttpException('Failed to deliver test alert to any recipient', HttpStatus.BAD_GATEWAY);
        }

        project.alertConfig = {
            ...cfg,
            lastTestSentAt: new Date().toISOString(),
        };
        await project.save();
        return { ok: true, ...result };
    }

    private buildPayload(params: {
        type: CriticalAlertType;
        project: OperatorProject;
        anomaly?: AnomalyAlertNumbers;
        budget?: BudgetAlertNumbers;
    }): CriticalAlertMailPayload {
        const base = (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://app.aipbx.ru')
            .replace(/\/$/, '');
        const dashboardUrl = `${base}/dashboard/call-records?projectId=${params.project.id}`;
        return {
            type: params.type,
            projectName: params.project.name,
            dashboardUrl,
            anomaly: params.anomaly,
            budget: params.budget,
        };
    }

    private async deliver(
        payload: CriticalAlertMailPayload,
        recipients: AlertRecipients,
    ): Promise<{ emailed: number; telegram: number }> {
        const mail = buildCriticalAlertMail(payload);
        const attachments = buildBillingMailAttachments();
        let emailed = 0;
        let telegram = 0;

        for (const email of recipients.emails) {
            try {
                await this.mailerService.sendAnalyticsDigestMail(
                    email,
                    mail.subject,
                    mail.html,
                    mail.text,
                    attachments,
                );
                emailed++;
            } catch (e) {
                this.logger.error(`Alert email to ${email} failed: ${(e as Error).message}`);
            }
        }

        const caption = buildCriticalAlertTelegramCaption(payload);
        for (const chatId of recipients.telegramChatIds) {
            try {
                await this.telegramService.sendMessage(caption, { parse_mode: 'HTML' }, chatId);
                telegram++;
            } catch (e) {
                this.logger.error(`Alert Telegram to ${chatId} failed: ${(e as Error).message}`);
            }
        }

        this.logger.log(
            `Critical alert ${payload.type} project "${payload.projectName}": emailed=${emailed} telegram=${telegram}`,
        );
        return { emailed, telegram };
    }
}
