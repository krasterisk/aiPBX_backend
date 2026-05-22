const sendMail = jest.fn().mockResolvedValue({ messageId: '1' });

jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({ sendMail })),
}));

import { MailerService } from './mailer.service';

describe('MailerService.sendLowBalanceNotification', () => {
    let service: MailerService;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MAIL_USER = 'test@example.com';
        process.env.TENANT_CURRENCY = 'RUB';
        process.env.MAIL_LOCALE = 'ru';
        process.env.CLIENT_URL = 'https://aipbx.ru';
        service = new MailerService();
    });

    it('sends html notification without attachment', async () => {
        await service.sendLowBalanceNotification(['a@b.com'], 12.5, 100);

        expect(sendMail).toHaveBeenCalledTimes(1);
        const mail = sendMail.mock.calls[0][0];
        expect(mail.to).toBe('a@b.com');
        expect(mail.bcc).toBe('test@example.com');
        expect(mail.attachments).toEqual([
            expect.objectContaining({ cid: 'aipbx-logo', filename: 'aipbx_logo_v3.png' }),
        ]);
        expect(mail.html).toContain('12.50');
        expect(mail.html).toContain('https://aipbx.ru/payment');
        expect(mail.html).toContain('Здравствуйте');
    });

    it('attaches invoice PDF when provided', async () => {
        await service.sendLowBalanceNotification(
            ['a@b.com'],
            5,
            100,
            {
                filename: 'Schet_1.pdf',
                path: '/tmp/schet.pdf',
                invoiceNumber: 'AIPBX-00001',
            },
        );

        const mail = sendMail.mock.calls[0][0];
        expect(mail.attachments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ filename: 'Schet_1.pdf', path: '/tmp/schet.pdf' }),
                expect.objectContaining({ cid: 'aipbx-logo', filename: 'aipbx_logo_v3.png' }),
            ]),
        );
        expect(mail.html).toContain('приложен счёт');
        expect(mail.html).toContain('личном кабинете');
        expect(mail.html).not.toContain('готовы помочь');
        expect(mail.html).toContain('https://aipbx.ru/payment');
        expect(mail.subject).toMatch(/счёт|invoice/i);
    });

    it('skips send when recipients empty', async () => {
        await service.sendLowBalanceNotification([], 1, 1);
        expect(sendMail).not.toHaveBeenCalled();
    });
});
