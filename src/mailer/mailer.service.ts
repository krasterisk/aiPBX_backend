import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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

    async sendActivationMail(to: string, code: string) {
        if (!to || !code) {
            this.logger.error(`Error send mail to: ${to}, code: ${code}`)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to,
                bcc: process.env.MAIL_USER,
                subject: `Auth code: ${code}`,
                text: '',
                html: `
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
            `,
            });
            this.logger.log(`Send email to ${to} from ${process.env.MAIL_USER}`)
            return { success: true }
        } catch (e) {
            this.logger.error('Error send mail' + e)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async sendResetPasswordMail(to: string, link: string) {
        const resetPasswordLink = `${process.env.API_URL}/api/users/resetPassword/${link}`
        await this.transporter.sendMail({
            from: process.env.MAIL_USER,
            to,
            subject: 'AI PBX. Password reset request',
            text: '',
            html: `
                <div>
                    <h3>For your account requaired password reset</h3>
                    <p>Warning! If your don't do it, don't press the activation link!</a></p>
                    <p>For reset password go to the<a href="${resetPasswordLink}" target="_blank"> link</a></p>
                </div>
            `,
        });
    }

    async sendLowBalanceNotification(to: string[], balance: number, limit: number) {
        if (!to || to.length === 0) return;

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject: 'AI PBX Balance Alert',
                html: `
                <body>
                    <div>
                        <h2>Balance Alert</h2>
                        <p>Your balance has dropped below your set limit.</p>
                        <p><strong>Current Balance: ${balance.toFixed(2)}</strong></p>
                        <p><strong>Limit Threshold: ${limit.toFixed(2)}</strong></p>
                        <p>Please top up your account to ensure uninterrupted service.</p>
                        <br/>
                        <h5>AI PBX Team</h5>
                    </div>
                </body>
            `,
            });
            this.logger.log(`Sent low balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending low balance alert', e);
            // Don't throw, just log. We don't want to break the billing flow if email fails.
        }
    }
    async sendZeroBalanceNotification(to: string[], balance: number) {
        if (!to || to.length === 0) return;

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject: 'AI PBX Service Suspended',
                html: `
                <body>
                    <div>
                        <h2>Service Suspended</h2>
                        <p style="color: red;"><strong>Your balance has reached zero or less. Your service has been suspended.</strong></p>
                        <p><strong>Current Balance: ${balance.toFixed(2)}</strong></p>
                        <p>Please top up your account immediately to restore service.</p>
                        <br/>
                        <h5>AI PBX Team</h5>
                    </div>
                </body>
            `,
            });
            this.logger.log(`Sent zero balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending zero balance alert', e);
        }
    }
}
