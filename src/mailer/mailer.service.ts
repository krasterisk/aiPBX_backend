import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
    private transporter;
    private readonly logger = new Logger(MailerService.name);
    private readonly isRussian: boolean;

    constructor() {
        this.isRussian = (process.env.MAIL_USER || '').endsWith('@aipbx.ru');

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

        const subject = this.isRussian
            ? `Код авторизации: ${code}`
            : `Auth code: ${code}`;

        const html = this.isRussian
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
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to,
                bcc: process.env.MAIL_USER,
                subject,
                text: '',
                html,
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

        const subject = this.isRussian
            ? 'AI PBX. Сброс пароля'
            : 'AI PBX. Password reset request';

        const html = this.isRussian
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

        await this.transporter.sendMail({
            from: process.env.MAIL_USER,
            to,
            subject,
            text: '',
            html,
        });
    }

    async sendLowBalanceNotification(to: string[], balance: number, limit: number) {
        if (!to || to.length === 0) return;

        const subject = this.isRussian
            ? 'AI PBX — Уведомление о балансе'
            : 'AI PBX Balance Alert';

        const html = this.isRussian
            ? `
                <body>
                    <div>
                        <h2>Уведомление о балансе</h2>
                        <p>Ваш баланс опустился ниже установленного лимита.</p>
                        <p><strong>Текущий баланс: ${balance.toFixed(2)}</strong></p>
                        <p><strong>Пороговое значение: ${limit.toFixed(2)}</strong></p>
                        <p>Пожалуйста, пополните баланс для продолжения работы.</p>
                        <br/>
                        <h5>Команда AI PBX</h5>
                    </div>
                </body>
            `
            : `
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
            `;

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject,
                html,
            });
            this.logger.log(`Sent low balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending low balance alert', e);
        }
    }

    async sendCriticalBalanceNotification(to: string[], balance: number) {
        if (!to || to.length === 0) return;

        const subject = this.isRussian
            ? 'AI PBX — Баланс менее $3'
            : 'AI PBX — Balance Below $3';

        const html = this.isRussian
            ? `
                <body>
                    <div>
                        <h2>Низкий баланс</h2>
                        <p style="color: #e67e22;"><strong>Ваш баланс составляет менее $3. Рекомендуем пополнить счёт.</strong></p>
                        <p><strong>Текущий баланс: $${balance.toFixed(2)}</strong></p>
                        <p>Пожалуйста, пополните баланс, чтобы избежать приостановки сервиса.</p>
                        <br/>
                        <h5>Команда AI PBX</h5>
                    </div>
                </body>
            `
            : `
                <body>
                    <div>
                        <h2>Low Balance Warning</h2>
                        <p style="color: #e67e22;"><strong>Your balance is below $3. We recommend topping up your account.</strong></p>
                        <p><strong>Current Balance: $${balance.toFixed(2)}</strong></p>
                        <p>Please add funds to avoid service interruption.</p>
                        <br/>
                        <h5>AI PBX Team</h5>
                    </div>
                </body>
            `;

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject,
                html,
            });
            this.logger.log(`Sent critical balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending critical balance alert', e);
        }
    }

    async sendZeroBalanceNotification(to: string[], balance: number) {
        if (!to || to.length === 0) return;

        const subject = this.isRussian
            ? 'AI PBX — Сервис приостановлен'
            : 'AI PBX Service Suspended';

        const html = this.isRussian
            ? `
                <body>
                    <div>
                        <h2>Сервис приостановлен</h2>
                        <p style="color: red;"><strong>Ваш баланс достиг нуля. Сервис приостановлен.</strong></p>
                        <p><strong>Текущий баланс: ${balance.toFixed(2)}</strong></p>
                        <p>Пожалуйста, пополните баланс для восстановления работы.</p>
                        <br/>
                        <h5>Команда AI PBX</h5>
                    </div>
                </body>
            `
            : `
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
            `;

        try {
            await this.transporter.sendMail({
                from: `"AI PBX" <${process.env.MAIL_USER}>`,
                to: to.join(', '),
                subject,
                html,
            });
            this.logger.log(`Sent zero balance alert to ${to.join(', ')}`);
        } catch (e) {
            this.logger.error('Error sending zero balance alert', e);
        }
    }
}
