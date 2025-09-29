import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
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
                subject: `${code} is your AI PBX login code`,
                text: '',
                html: `
                <body>
                    <div>
                        <p>
                            <h2>Your login code is: ${code}</h2>
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
}
