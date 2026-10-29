const sendMail = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail })) }));
import { MailerService } from './mailer.service';

describe('credit preview envelope and currency resolution', () => {
    const env = { ...process.env };
    const params = { clientName: 'Test client', personalAccountNumber: 'AIPBX-12345678', amountUsd: 50,
        balanceAfterUsd: 60, creditedAt: new Date('2026-10-29T03:29:10Z'), originalAmount: 5000, originalCurrency: 'RUB' };
    beforeEach(() => {
        jest.clearAllMocks(); process.env.MAIL_USER = 'sender@example.com'; process.env.MAIL_LOCALE = 'ru';
        sendMail.mockResolvedValue({ messageId: 'test', accepted: ['admin@krasterisk.ru'], rejected: [] });
    });
    afterEach(() => { process.env = { ...env }; });
    it('sends approval preview only to requested administrator, without CC or BCC', async () => {
        const service = new MailerService();
        await service.sendBalanceCreditNotification(['admin@krasterisk.ru'], params, 'RUB', { preview: true, rate: 80 });
        const mail = sendMail.mock.calls[0][0];
        expect(mail.to).toBe('admin@krasterisk.ru'); expect(mail.cc).toBeUndefined(); expect(mail.bcc).toBeUndefined();
        expect(mail.subject).toMatch(/^\[Согласование\]/); expect(mail.html).toContain('₽');
        expect(mail.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ cid: 'aipbx-logo' })]));
    });
    it('uses strict conversion for customer currency and never relabels an unavailable rate', async () => {
        const converter = { convertFromUsd: jest.fn().mockResolvedValue({ rate: 80, amount: 80 }) };
        const service = new MailerService(converter as any);
        await service.sendZeroBalanceNotification(['owner@example.com'], -1, 'RUB');
        expect(converter.convertFromUsd).toHaveBeenCalledWith(1, 'RUB', true);
        expect(sendMail.mock.calls[0][0].html).toContain('₽');
        sendMail.mockClear(); converter.convertFromUsd.mockRejectedValue(new Error('rate missing'));
        await service.sendZeroBalanceNotification(['owner@example.com'], -1, 'RUB');
        expect(sendMail).not.toHaveBeenCalled();
    });
});
