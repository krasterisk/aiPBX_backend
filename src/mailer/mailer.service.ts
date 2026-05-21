import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { usesRussianMailLocale } from './mailer-locale';
import {
    criticalBalanceMail,
    lowBalanceMail,
    runwayBalanceMail,
    zeroBalanceMail,
    type RunwayMailParams,
} from './billing-mail.templates';
import { buildBillingMailAttachments } from './billing-mail.attachments';
import { activationMail, resetPasswordMail, type AuthMailPurpose } from './auth-mail.templates';

@Injectable()
export class MailerService {
    private transporter;
    private readonly logger = new Logger(MailerService.name);

    constructor() {

        this.transporter = nodemailer.createTransport({
            from: `"AI PBX" <${process.env.MAIL_USER}>`,
            port: 587,
            host: process.env.MAIL_HOST,
            secure: false,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        });
    }

    /** Копия в ящик отправителя (через BCC), чтобы письма сохранялись на MAIL_USER. */
    private withSenderMailboxCopy(
        options: nodemailer.SendMailOptions,
    ): nodemailer.SendMailOptions {
        const sender = process.env.MAIL_USER;
        if (!sender) return options;
        return { ...options, bcc: sender };
    }

    async sendActivationMail(to: string, code: string, purpose: AuthMailPurpose = 'login') {
        if (!to || !code) {
            this.logger.error(`Error send mail to: ${to}, code: ${code}`)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const isRu = usesRussianMailLocale();
        const { subject, html } = activationMail(isRu, code, purpose);

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to,
                subject,
                text: '',
                html,
                attachments: buildBillingMailAttachments(),
            }));
            this.logger.log(`Send email to ${to} from ${process.env.MAIL_USER}`)
            return { success: true }
        } catch (e) {
            this.logger.error('Error send mail' + e)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async sendResetPasswordMail(to: string, link: string) {
        const resetPasswordLink = `${process.env.API_URL}/api/users/resetPassword/${link}`;
        const isRu = usesRussianMailLocale();
        const { subject, html } = resetPasswordMail(isRu, resetPasswordLink);

        await this.transporter.sendMail(this.withSenderMailboxCopy({
            from: `"AI PBX" <${process.env.MAIL_USER}>`,
            to,
            subject,
            text: '',
            html,
            attachments: buildBillingMailAttachments(),
        }));
    }

    async sendLowBalanceNotification(
        to: string[],
        balance: number,
        limit: number,
        invoiceAttachment?: { filename: string; path: string; invoiceNumber?: string },
    ) {
        if (!to || to.length === 0) return;

        const { subject, html } = lowBalanceMail(
            usesRussianMailLocale(),
            balance,
            limit,
            !!invoiceAttachment?.path,
        );

        const mail: nodemailer.SendMailOptions = {
            from: `"AI PBX" <${process.env.MAIL_USER}>`,
            to: to.join(', '),
            subject,
            html,
            attachments: buildBillingMailAttachments(
                invoiceAttachment?.path
                    ? { filename: invoiceAttachment.filename, path: invoiceAttachment.path }
                    : undefined,
            ),
        };

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy(mail));
            this.logger.log(`Sent low balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending low balance alert', e);
        }
    }

    async sendCriticalBalanceNotification(to: string[], balance: number) {
        if (!to || to.length === 0) return;

        const { subject, html } = criticalBalanceMail(usesRussianMailLocale(), balance);

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject,
                html,
                attachments: buildBillingMailAttachments(),
            }));
            this.logger.log(`Sent critical balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending critical balance alert', e);
        }
    }

    async sendZeroBalanceNotification(to: string[], balance: number) {
        if (!to || to.length === 0) return;

        const { subject, html } = zeroBalanceMail(usesRussianMailLocale(), balance);

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject,
                html,
                attachments: buildBillingMailAttachments(),
            }));
            this.logger.log(`Sent zero balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending zero balance alert', e);
        }
    }

    async sendBalanceRunwayNotification(
        to: string[],
        params: RunwayMailParams,
        invoiceAttachment?: { filename: string; path: string; invoiceNumber?: string },
    ) {
        if (!to?.length) return;

        const mailParams: RunwayMailParams = {
            ...params,
            invoiceNumber: invoiceAttachment?.invoiceNumber,
        };
        const { subject, html } = runwayBalanceMail(usesRussianMailLocale(), mailParams);

        const mail: nodemailer.SendMailOptions = {
            from: `"AI PBX" <${process.env.MAIL_USER}>`,
            to: to.join(', '),
            subject,
            html,
            attachments: buildBillingMailAttachments(
                invoiceAttachment?.path
                    ? { filename: invoiceAttachment.filename, path: invoiceAttachment.path }
                    : undefined,
            ),
        };

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy(mail));
            this.logger.log(`Sent balance runway alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending balance runway alert', e);
        }
    }
}
