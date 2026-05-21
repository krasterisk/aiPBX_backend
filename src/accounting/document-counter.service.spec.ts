import {
    DocumentCounterService,
    getDayOfYear,
} from './document-counter.service';

describe('DocumentCounterService', () => {
    const envBackup = { ...process.env };
    let service: DocumentCounterService;

    beforeEach(() => {
        process.env = {
            ...envBackup,
            INVOICE_NUMBER_PREFIX: 'AIPBX',
            INVOICE_NUMBER_MIN_WIDTH: '5',
        };
        service = new DocumentCounterService({} as never);
    });

    afterEach(() => {
        process.env = envBackup;
    });

    it('getDayOfYear returns 1 for Jan 1', () => {
        expect(getDayOfYear(new Date(2026, 0, 1))).toBe(1);
    });

    it('formatInvoiceNumber: day-of-year (3) + seq as one number', () => {
        expect(service.formatInvoiceNumber(3, 142)).toBe('AIPBX-01423');
        expect(service.formatInvoiceNumber(262, 360)).toBe('AIPBX-360262');
        expect(service.formatInvoiceNumber(423, 1)).toBe('AIPBX-001423');
    });

    it('invoiceCounterDocType scopes counter per calendar day', () => {
        expect(service.invoiceCounterDocType(142)).toBe('invoice-d142');
    });
});
