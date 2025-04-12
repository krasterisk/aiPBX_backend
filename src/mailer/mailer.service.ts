import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
    private transporter;

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
        const activationLink = `${process.env.API_URL}/api/users/activate/${link}`
        await this.transporter.sendMail({
            from: process.env.MAIL_USER,
            to,
            subject: 'Ai PBX. Activation account',
            text: '',
            html: `
                <div>
                    <h3>Activation account</h3>
                    <p>For finish activation go to <a href="${activationLink}" target="_blank"> link</a></p>
                </div>
            `,
        });
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
