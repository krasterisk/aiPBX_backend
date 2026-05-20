import {
    isInvoiceBillingEnabled,
    isInvoiceBillingHostAllowed,
} from './invoice-billing-context';

describe('invoice-billing-context', () => {
    const envBackup = { ...process.env };

    afterEach(() => {
        process.env = { ...envBackup };
    });

    describe('isInvoiceBillingEnabled', () => {
        it('is true for RUB tenant', () => {
            process.env.TENANT_CURRENCY = 'RUB';
            process.env.NODE_ENV = 'production';
            expect(isInvoiceBillingEnabled()).toBe(true);
        });

        it('is true in non-production even for USD tenant', () => {
            process.env.TENANT_CURRENCY = 'USD';
            process.env.NODE_ENV = 'development';
            expect(isInvoiceBillingEnabled()).toBe(true);
        });

        it('is false for USD in production', () => {
            process.env.TENANT_CURRENCY = 'USD';
            process.env.NODE_ENV = 'production';
            expect(isInvoiceBillingEnabled()).toBe(false);
        });
    });

    describe('isInvoiceBillingHostAllowed', () => {
        beforeEach(() => {
            process.env.TENANT_CURRENCY = 'RUB';
            process.env.NODE_ENV = 'production';
        });

        it('allows aipbx.ru when allowlisted', () => {
            process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
            expect(isInvoiceBillingHostAllowed('aipbx.ru')).toBe(true);
        });

        it('allows localhost in development', () => {
            process.env.NODE_ENV = 'development';
            process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
            expect(isInvoiceBillingHostAllowed('localhost')).toBe(true);
        });

        it('returns false when billing disabled', () => {
            process.env.TENANT_CURRENCY = 'USD';
            process.env.NODE_ENV = 'production';
            expect(isInvoiceBillingHostAllowed('aipbx.ru')).toBe(false);
        });
    });
});
