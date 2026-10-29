import { balanceCreditMail } from './balance-credit.template';
import { criticalBalanceMail, lowBalanceMail, runwayBalanceMail, zeroBalanceMail } from './billing-mail.templates';

describe('billing email display currency', () => {
    const money = { currency: 'RUB', rate: 80 };
    const normalize = (html: string) => html.replace(/[\u00a0\u202f]/g, ' ');
    it('converts balance, threshold, critical threshold and daily runway spend to RUB', () => {
        const low = normalize(lowBalanceMail(true, 12.5, 100, undefined, money).html);
        expect(low).toContain('1 000,00'); expect(low).toContain('8 000,00'); expect(low).not.toContain('$');
        const critical = normalize(criticalBalanceMail(true, 2, money).html);
        expect(critical).toContain('160,00'); expect(critical).toContain('240,00'); expect(critical).not.toContain('$3');
        expect(normalize(zeroBalanceMail(true, -1, money).html)).toContain('-80,00');
        const runway = normalize(runwayBalanceMail(true, { balanceUsd: 10, dailyBurnUsd: 2, daysLeft: 5, alertDays: 7, lookbackDays: 30 }, money).html);
        expect(runway).toContain('800,00'); expect(runway).toContain('160,00'); expect(runway).not.toContain('$');
    });
    it('formats actual credit in customer currency with original deposit amount and escaped client', () => {
        const mail = balanceCreditMail(true, { clientName: 'Client <script>', personalAccountNumber: 'AIPBX-12345678',
            amountUsd: 62.11, balanceAfterUsd: 62, creditedAt: new Date('2026-10-29T03:29:10Z'),
            originalAmount: 5000, originalCurrency: 'RUB' }, money);
        expect(normalize(mail.html)).toContain('5 000,00'); expect(mail.html).toContain('₽');
        expect(mail.html).toContain('Client &lt;script&gt;'); expect(mail.html).not.toContain('Client <script>');
        expect(mail.html).not.toContain('62.11'); expect(mail.html).not.toContain('Перейти к оплате');
        expect(mail.html).toContain('Посмотреть баланс'); expect(mail.text).toContain('AIPBX-12345678');
    });
    it('preserves USD formatting and supports a third currency', () => {
        expect(lowBalanceMail(false, 10, 20).html).toContain('$10.00');
        const eur = zeroBalanceMail(false, -2, { currency: 'EUR', rate: 0.9 }).html;
        expect(eur).toContain('€'); expect(eur).toContain('1.80'); expect(eur).not.toContain('$');
    });
});
