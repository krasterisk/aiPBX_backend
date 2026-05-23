import { Organization } from '../organizations/organizations.model';
import { OurOrganization } from '../our-organizations/our-organization.model';
import type { OrganizationLegalForm } from './sbis.types';

export interface InvoiceChetopAddressRf {
    index?: string | null;
    regionCode?: string | null;
    regionName?: string | null;
    city?: string | null;
    street?: string | null;
    house?: string | null;
    flat?: string | null;
}

export interface InvoiceChetopParty {
    legalForm: OrganizationLegalForm;
    inn: string;
    kpp?: string | null;
    name: string;
    shortName?: string | null;
    address: string;
    addressRf?: InvoiceChetopAddressRf | null;
    ogrn?: string | null;
    ogrnip?: string | null;
    /** DD.MM.YYYY for СвИП/@ДатаОГРНИП */
    ogrnipRegDate?: string | null;
    okpo?: string | null;
    phone?: string | null;
    email?: string | null;
    fio?: { family: string; first: string; patronymic?: string };
    bank?: {
        bic: string;
        name: string;
        corrAccount: string;
        settlementAccount: string;
    };
}

/** Parse FIO for СвИП; strips leading «ИП» from name/director fields. */
export function parsePersonFio(fullName: string): { family: string; first: string; patronymic?: string } {
    let s = fullName.trim().replace(/^(ИП|ип)\s+/iu, '').trim();
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts[0]?.toUpperCase() === 'ИП') {
        parts.shift();
    }
    if (parts.length >= 3) {
        return { family: parts[0], first: parts[1], patronymic: parts.slice(2).join(' ') };
    }
    if (parts.length === 2) {
        return { family: parts[0], first: parts[1] };
    }
    return { family: parts[0] || fullName, first: '' };
}

function resolveIssuerBank(org: OurOrganization): InvoiceChetopParty['bank'] | undefined {
    const bic = (org.bankBic || '').trim();
    const settlement = (org.bankAccount || '').trim();
    const corr = (org.bankCorrAccount || '').trim();
    const name = (org.bankBranchName || '').trim() || (org.bankName || '').trim();
    if (!bic || !settlement || !name) return undefined;
    return { bic, settlementAccount: settlement, corrAccount: corr, name };
}

function resolveBuyerBank(org: Organization, issuerBank?: InvoiceChetopParty['bank']): InvoiceChetopParty['bank'] | undefined {
    const bic = (org.bankBic || '').trim();
    const settlement = (org.bankAccount || '').trim();
    const name = (org.bankName || '').trim() || issuerBank?.name || '';
    if (!bic || !settlement || !name) return undefined;
    const corr =
        issuerBank?.bic === bic && issuerBank.corrAccount
            ? issuerBank.corrAccount
            : '';
    return { bic, settlementAccount: settlement, corrAccount: corr, name };
}

/** Seller (our organization) for ON_CHETOP / ЭДОСч. */
export function buildChetopSellerFromIssuer(org: OurOrganization): InvoiceChetopParty {
    const legalForm = (org.legalForm === 'ip' ? 'ip' : 'ul') as OrganizationLegalForm;
    const director = (org.director || org.name).trim();

    const party: InvoiceChetopParty = {
        legalForm,
        inn: org.tin,
        kpp: org.kpp,
        name: org.name,
        shortName: org.name,
        address: org.address,
        ogrn: org.ogrn,
        ogrnip: legalForm === 'ip' ? org.ogrn : null,
        bank: resolveIssuerBank(org),
    };

    if (party.legalForm === 'ip') {
        party.fio = parsePersonFio(director);
    }

    return party;
}

/** Buyer (counterparty) for ON_CHETOP / ЭДОСч. */
export function buildChetopBuyerFromOrganization(
    org: Organization,
    issuerBank?: InvoiceChetopParty['bank'],
): InvoiceChetopParty {
    const legalForm = (org.legalForm === 'ip' ? 'ip' : 'ul') as OrganizationLegalForm;
    const party: InvoiceChetopParty = {
        legalForm,
        inn: org.tin,
        kpp: org.kpp,
        name: org.name,
        shortName: org.name,
        address: org.address,
        ogrn: org.ogrn,
        ogrnip: legalForm === 'ip' ? org.ogrn : null,
        phone: org.phone,
        email: org.email,
        bank: resolveBuyerBank(org, issuerBank),
    };

    if (legalForm === 'ip') {
        party.fio = parsePersonFio(org.director || org.name);
    }

    return party;
}
