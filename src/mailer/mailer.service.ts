import {HttpException, HttpStatus, Injectable, Logger} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
    private transporter;
    private readonly logger = new Logger(MailerService.name);

    constructor() {
        this.transporter = nodemailer.createTransport({
            port: 587,
            host: process.env.MAIL_HOST,
            secure: false,
            auth: {
                user: process.env.MAIL_USER,
                pass: process.env.MAIL_PASS,
            },
        });
    }

    async sendActivationMail(to: string, link: string) {
        if (!to || !link) {
            this.logger.error(`Error send mail to: ${to}, code: ${link}`)
            throw new HttpException("Error sending email", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        try {
            await this.transporter.sendMail({
                from: process.env.MAIL_USER,
                to,
                subject: `AiPBX activation code: ${link}`,
                text: '',
                html: `
                <body>
                    <div>
                        <p>
                            <h2>Your activation code is: ${link}</h2>
                            <h4>For your security, this code will expire in a few minutes.</h4>
                        </p>
                        <p>
                            <h5>AI PBX team</h5>
                        </p>
                    </div>
                </body>
            `,
            });
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
