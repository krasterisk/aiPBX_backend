import { billingInvoiceAttachmentNote, billingThanksParagraph } from './billing-mail.copy';

describe('billing-mail.copy', () => {
    it('billingThanksParagraph omits help wording', () => {
        expect(billingThanksParagraph(true)).toContain('Благодарим вас за использование AI PBX');
        expect(billingThanksParagraph(true)).not.toContain('помочь');
        expect(billingThanksParagraph(false)).not.toContain('assist');
    });

    it('average_monthly invoice note explains period and cabinet', () => {
        const html = billingInvoiceAttachmentNote({
            isRu: true,
            mode: 'average_monthly',
            estimatePeriodDays: 30,
        });
        expect(html).toContain('расчётную сумму за 30 дн.');
        expect(html).not.toContain('AIPBX');
        expect(html).not.toContain('№');
        expect(html).toContain('личном кабинете');
        expect(html).not.toContain('— вы можете использовать его для пополнения баланса.');
    });

    it('fixed invoice note mentions cabinet without period', () => {
        const html = billingInvoiceAttachmentNote({ isRu: true, mode: 'fixed' });
        expect(html).toContain('К письму приложен счёт на оплату');
        expect(html).not.toContain('расчётную сумму');
        expect(html).toContain('личном кабинете');
    });
});
