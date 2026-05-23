import {
    formatInvoiceLineItemSubject,
    stripLineItemPersonalAccountFromSubject,
    resolveInvoiceSubject,
} from './subject-resolver';

describe('subject-resolver', () => {
    it('stripLineItemPersonalAccountFromSubject removes л/с suffix', () => {
        expect(
            stripLineItemPersonalAccountFromSubject('Услуга AIPBX (л/с AIPBX-00000095)'),
        ).toBe('Услуга AIPBX');
    });

    it('formatInvoiceLineItemSubject adds л/с when missing', () => {
        expect(formatInvoiceLineItemSubject('Услуга', 'AIPBX-1')).toBe('Услуга (л/с AIPBX-1)');
    });

    it('resolveInvoiceSubject uses organization subject', () => {
        expect(
            resolveInvoiceSubject({
                organizationSubject: 'Аванс за услуги',
            }),
        ).toBe('Аванс за услуги');
    });
});
