import { HttpException, HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
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
import { CurrencyService } from '../currency/currency.service';
import { BillingMailMoney, USD_MAIL_MONEY } from './billing-mail.money';
import { balanceCreditMail, BalanceCreditMailParams } from './balance-credit.template';

@Injectable()
export class MailerService {
    private transporter;
    private readonly logger = new Logger(MailerService.name);

    constructor(@Optional() private readonly currencyService?: CurrencyService) {

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

    async resolveMoney(currency = 'USD'): Promise<BillingMailMoney> {
        const code = currency.trim().toUpperCase();
        if (code === 'USD') return USD_MAIL_MONEY;
        if (!/^[A-Z]{3}$/.test(code) || !this.currencyService) throw new Error('Mail currency conversion unavailable');
        const { rate } = await this.currencyService.convertFromUsd(1, code, true);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid mail currency rate');
        return { currency: code, rate };
    }

    async sendBalanceCreditNotification(to: string[], params: BalanceCreditMailParams, currency: string,
        options: { preview?: boolean; rate?: number } = {}) {
        if (!to.length) return { status: 'no_recipients' };
        const money = Number.isFinite(options.rate) && options.rate > 0
            ? { currency: currency.toUpperCase(), rate: options.rate } : await this.resolveMoney(currency);
        const { subject, html, text } = balanceCreditMail(usesRussianMailLocale(), params, money);
        const mail: nodemailer.SendMailOptions = {
            from: `"AI PBX" <${process.env.MAIL_USER}>`, to: to.join(', '),
            subject: options.preview ? `[Согласование] ${subject}` : subject,
            html, text, attachments: buildBillingMailAttachments(),
        };
        // Administrator-only preview has no sender copy and no customer recipients.
        const result = await this.transporter.sendMail(options.preview ? mail : this.withSenderMailboxCopy(mail));
        if (result.rejected?.length) throw new Error('Balance credit email recipient rejected');
        return { status: 'sent', messageId: result.messageId, accepted: result.accepted, rejected: result.rejected };
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

    async sendHelpdeskNotification(to: string, subject: string, html: string, text: string) {
        if (!to) return;
        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX Helpdesk" <${process.env.MAIL_USER}>`,
                to,
                subject,
                text,
                html,
            }));
        } catch (e) {
            this.logger.error('Error send helpdesk mail' + e);
            throw new HttpException('Error sending email', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async sendAnalyticsDigestMail(
        to: string,
        subject: string,
        html: string,
        text: string,
        attachments?: nodemailer.SendMailOptions['attachments'],
    ) {
        if (!to) return;
        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX Analytics" <${process.env.MAIL_USER}>`,
                to,
                subject,
                text,
                html,
                attachments,
            }));
            this.logger.log(`Sent analytics digest to ${to}`);
        } catch (e) {
            this.logger.error('Error send analytics digest mail' + e);
            throw new HttpException('Error sending email', HttpStatus.INTERNAL_SERVER_ERROR);
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
        invoiceAttachment?: {
            filename: string;
            path: string;
            invoiceNumber?: string;
            amountMode?: 'fixed' | 'average_monthly';
        },
        currency = 'USD',
    ) {
        if (!to || to.length === 0) return;

        const money = await this.resolveMoney(currency).catch(() => null);
        if (!money) { this.logger.warn('Balance email skipped: display currency unavailable'); return; }
        const invoice = invoiceAttachment?.path
            ? { amountMode: invoiceAttachment.amountMode ?? 'fixed' }
            : undefined;
        const { subject, html } = lowBalanceMail(
            usesRussianMailLocale(),
            balance,
            limit,
            invoice,
            money,
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

    async sendCriticalBalanceNotification(to: string[], balance: number, currency = 'USD') {
        if (!to || to.length === 0) return;

        const money = await this.resolveMoney(currency).catch(() => null);
        if (!money) { this.logger.warn('Balance email skipped: display currency unavailable'); return; }
        const { subject, html } = criticalBalanceMail(usesRussianMailLocale(), balance, money);

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

    async sendZeroBalanceNotification(to: string[], balance: number, currency = 'USD') {
        if (!to || to.length === 0) return;

        const money = await this.resolveMoney(currency).catch(() => null);
        if (!money) { this.logger.warn('Balance email skipped: display currency unavailable'); return; }
        const { subject, html } = zeroBalanceMail(usesRussianMailLocale(), balance, money);

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
        currency = 'USD',
    ) {
        if (!to?.length) return;

        const money = await this.resolveMoney(currency).catch(() => null);
        if (!money) { this.logger.warn('Runway email skipped: display currency unavailable'); return; }
        const mailParams: RunwayMailParams = {
            ...params,
            invoiceNumber: invoiceAttachment?.invoiceNumber,
        };
        const { subject, html } = runwayBalanceMail(usesRussianMailLocale(), mailParams, money);

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
