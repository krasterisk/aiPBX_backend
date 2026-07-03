import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/sequelize';
import { getConnectionToken } from '@nestjs/sequelize';
import { InvoiceService } from './invoice.service';
import { Organization } from '../organizations/organizations.model';
import { OrganizationDocument } from './organization-document.model';
import { User } from '../users/users.model';
import { DocumentCounterService } from './document-counter.service';
import { AlfawebhookClient } from './alfawebhook-client.service';
import { SbisService } from './sbis.service';
import { OurOrganizationsService } from '../our-organizations/our-organizations.service';
import { OrganizationEdoService } from '../organizations/organization-edo.service';

describe('InvoiceService.isHostAllowedForRuBilling', () => {
    let service: InvoiceService;
    const envBackup = { ...process.env };

    beforeEach(async () => {
        process.env = { ...envBackup };
        process.env.TENANT_CURRENCY = 'RUB';
        process.env.NODE_ENV = 'production';
        const moduleRef = await Test.createTestingModule({
            providers: [
                InvoiceService,
                { provide: getModelToken(Organization), useValue: {} },
                { provide: getModelToken(OrganizationDocument), useValue: {} },
                { provide: getModelToken(User), useValue: {} },
                { provide: getConnectionToken(), useValue: {} },
                { provide: DocumentCounterService, useValue: {} },
                { provide: AlfawebhookClient, useValue: {} },
                { provide: SbisService, useValue: {} },
                { provide: OurOrganizationsService, useValue: {} },
                { provide: OrganizationEdoService, useValue: {} },
            ],
        }).compile();
        service = moduleRef.get(InvoiceService);
    });

    afterEach(() => {
        process.env = envBackup;
    });

    it('allows any host when INVOICE_BILLING_ALLOWED_HOSTS is unset', () => {
        delete process.env.INVOICE_BILLING_ALLOWED_HOSTS;
        expect(service.isHostAllowedForRuBilling('aipbx.ru')).toBe(true);
        expect(service.isHostAllowedForRuBilling()).toBe(true);
    });

    it('allows any host when INVOICE_BILLING_ALLOWED_HOSTS is *', () => {
        process.env.INVOICE_BILLING_ALLOWED_HOSTS = '*';
        expect(service.isHostAllowedForRuBilling('evil.com')).toBe(true);
    });

    it('restricts HTTP hosts to allowlist', () => {
        process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
        expect(service.isHostAllowedForRuBilling('aipbx.ru')).toBe(true);
        expect(service.isHostAllowedForRuBilling('app.aipbx.ru')).toBe(true);
        expect(service.isHostAllowedForRuBilling('aipbx.net')).toBe(false);
    });

    it('allows internal invoice when no Host and no INVOICE_BILLING_DEFAULT_HOST', () => {
        process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
        delete process.env.INVOICE_BILLING_DEFAULT_HOST;
        expect(service.isHostAllowedForRuBilling()).toBe(true);
        expect(service.isHostAllowedForRuBilling('')).toBe(true);
    });

    it('checks INVOICE_BILLING_DEFAULT_HOST for internal invoice when set', () => {
        process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
        process.env.INVOICE_BILLING_DEFAULT_HOST = 'aipbx.ru';
        expect(service.isHostAllowedForRuBilling()).toBe(true);

        process.env.INVOICE_BILLING_DEFAULT_HOST = 'aipbx.net';
        expect(service.isHostAllowedForRuBilling()).toBe(false);
    });

    it('allows internal invoice when INVOICE_BILLING_DEFAULT_HOST is *', () => {
        process.env.INVOICE_BILLING_ALLOWED_HOSTS = 'aipbx.ru';
        process.env.INVOICE_BILLING_DEFAULT_HOST = '*';
        expect(service.isHostAllowedForRuBilling()).toBe(true);
        expect(service.isHostAllowedForRuBilling('')).toBe(true);
    });
});
