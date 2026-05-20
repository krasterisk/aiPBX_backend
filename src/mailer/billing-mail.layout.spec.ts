import { resolvePaymentPageUrl, wrapBillingMailHtml } from './billing-mail.layout';

describe('billing-mail layout', () => {
    const envBackup = { ...process.env };

    afterEach(() => {
        process.env = { ...envBackup };
    });

    it('builds payment URL from CLIENT_URL without trailing slash', () => {
        process.env.CLIENT_URL = 'https://aipbx.ru/';
        expect(resolvePaymentPageUrl()).toBe('https://aipbx.ru/payment');
    });

    it('includes payment link and logo cid in wrapped html', () => {
        process.env.CLIENT_URL = 'https://aipbx.ru';
        const html = wrapBillingMailHtml({
            isRu: true,
            title: 'Test',
            intro: 'Здравствуйте!',
            bodyHtml: '<p>Body</p>',
        });
        expect(html).toContain('https://aipbx.ru/payment');
        expect(html).toContain('Перейти к оплате');
        expect(html).toContain('cid:aipbx-logo');
        expect(html).toContain('С уважением');
    });
});
