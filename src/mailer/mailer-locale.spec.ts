import { usesRussianMailLocale } from './mailer-locale';
import { runwayBalanceMail } from './billing-mail.templates';

describe('mailer locale', () => {
    const envBackup = { ...process.env };

    afterEach(() => {
        process.env = { ...envBackup };
    });

    it('uses Russian for RUB tenant', () => {
        process.env.TENANT_CURRENCY = 'RUB';
        process.env.CLIENT_URL = 'https://aipbx.ru';
        delete process.env.MAIL_LOCALE;
        expect(usesRussianMailLocale()).toBe(true);
        const mail = runwayBalanceMail(true, {
            balanceUsd: 10,
            daysLeft: 5,
            alertDays: 7,
            lookbackDays: 7,
            dailyBurnUsd: 2,
        });
        expect(mail.subject).toContain('прогноз');
        expect(mail.html).toContain('https://aipbx.ru/payment');
        expect(mail.html).toContain('Здравствуйте');
    });

    it('uses English for USD tenant in production', () => {
        process.env.TENANT_CURRENCY = 'USD';
        process.env.NODE_ENV = 'production';
        delete process.env.MAIL_LOCALE;
        expect(usesRussianMailLocale()).toBe(false);
        const mail = runwayBalanceMail(false, {
            balanceUsd: 10,
            daysLeft: 5,
            alertDays: 7,
            lookbackDays: 7,
            dailyBurnUsd: 2,
        });
        expect(mail.subject).toContain('forecast');
        expect(mail.html).toContain('/payment');
    });
});
