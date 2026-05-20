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

    async sendActivationMail(to: string, code: string) {
        if (!to || !code) {
            this.logger.error(`Error send mail to: ${to}, code: ${code}`)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const isRu = usesRussianMailLocale();
        const subject = isRu
            ? `Код авторизации: ${code}`
            : `Auth code: ${code}`;

        const html = isRu
            ? `
                <body>
                    <div>
                        <p>
                            <h2>Ваш код авторизации: ${code}</h2>
                            <h4>В целях безопасности код истечёт через несколько минут.</h4>
                        </p>
                        <p>
                            <h5>Команда AI PBX</h5>
                        </p>
                    </div>
                </body>
            `
            : `
                <body>
                    <div>
                        <p>
                            <h2>Your authorization code is: ${code}</h2>
                            <h4>For your security, this code will expire in a few minutes.</h4>
                        </p>
                        <p>
                            <h5>AI PBX team</h5>
                        </p>
                    </div>
                </body>
            `;

        try {
            await this.transporter.sendMail(this.withSenderMailboxCopy({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to,
                subject,
                text: '',
                html,
            }));
            this.logger.log(`Send email to ${to} from ${process.env.MAIL_USER}`)
            return { success: true }
        } catch (e) {
            this.logger.error('Error send mail' + e)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async sendResetPasswordMail(to: string, link: string) {
        const resetPasswordLink = `${process.env.API_URL}/api/users/resetPassword/${link}`

        const isRu = usesRussianMailLocale();
        const subject = isRu
            ? 'AI PBX. Сброс пароля'
            : 'AI PBX. Password reset request';

        const html = isRu
            ? `
                <div>
                    <h3>Запрошен сброс пароля для вашей учётной записи</h3>
                    <p>Внимание! Если вы не запрашивали сброс — не переходите по ссылке!</p>
                    <p>Для сброса пароля перейдите по <a href="${resetPasswordLink}" target="_blank">ссылке</a></p>
                </div>
            `
            : `
                <div>
                    <h3>For your account required password reset</h3>
                    <p>Warning! If you don't do it, don't press the activation link!</p>
                    <p>For reset password go to the <a href="${resetPasswordLink}" target="_blank">link</a></p>
                </div>
            `;

        await this.transporter.sendMail(this.withSenderMailboxCopy({
            from: process.env.MAIL_USER,
            to,
            subject,
            text: '',
            html,
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
