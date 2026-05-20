export type OrganizationLegalForm = 'ul' | 'ip';

export interface CounterpartyLookupResult {
    inn: string;
    kpp: string | null;
    name: string;
    fullName: string | null;
    address: string | null;
    ogrn: string | null;
    director: string | null;
    directorPosition: string | null;
    okpo: string | null;
    legalForm: OrganizationLegalForm;
    sbisCounterpartyId: string | null;
    fromCache: boolean;
}

export interface SbisInvoiceDraftInput {
    counterpartyInn: string;
    counterpartyName: string;
    counterpartyKpp?: string | null;
    legalForm?: OrganizationLegalForm;
    ourOrganizationInn?: string | null;
    ourOrganizationKpp?: string | null;
    number: string;
    documentDate: string;
    amountRub: number;
    subject: string;
    paymentPurpose: string;
}

export interface SbisInvoiceDraftResult {
    documentId: string;
    revisionId: string | null;
    sbisNumber: string | null;
    sbisUrl: string | null;
}
