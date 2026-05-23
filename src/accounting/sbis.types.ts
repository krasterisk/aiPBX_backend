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
    /** ID участника ЭДО в СБИС (один на ответ; пусто, если СБИС не знает ящик). */
    sbisCounterpartyId: string | null;
    edoOperatorLabel: string | null;
    fromCache: boolean;
}

export interface SbisEdoInvitationResult {
    invitationId: string | null;
    stateCode: number | null;
    stateDescription: string | null;
    /** SBIS refused invitation because route is already active (Saby-native). */
    alreadyConnected?: boolean;
}

export interface SbisEdoInvitationState {
    invitationId: string;
    stateCode: number | null;
    stateDescription: string | null;
    stateChangedAt: Date | null;
    counterpartyEdoParticipantId: string | null;
    counterpartyInn: string | null;
    counterpartyKpp: string | null;
    ourEdoParticipantId: string | null;
}

/** SBIS counterparty lookup API response (discriminated by status). */
export type CounterpartyLookupApiResult =
    | { status: 'single'; data: CounterpartyLookupResult }
    | { status: 'choose'; inn: string; candidates: CounterpartyLookupResult[] }
    | { status: 'requires_kpp'; inn: string };

import type { InvoiceChetopParty } from './sbis-invoice-party';

export type { InvoiceChetopParty };

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
    /** Parties for ON_CHETOP 5.01 (ЭДОСч attachment). */
    seller?: InvoiceChetopParty;
    buyer?: InvoiceChetopParty;
    personalAccountNumber?: string | null;
}

export interface SbisInvoiceDraftResult {
    documentId: string;
    revisionId: string | null;
    sbisNumber: string | null;
    sbisUrl: string | null;
}

export interface SbisUpdDraftInput {
    counterpartyInn: string;
    counterpartyName: string;
    counterpartyKpp?: string | null;
    legalForm?: OrganizationLegalForm;
    ourOrganizationInn?: string | null;
    ourOrganizationKpp?: string | null;
    /** Omit — SBIS assigns Номер on shell; used in ON_NSCHFDOPPR after response. */
    number?: string | null;
    documentDate: string;
    periodFrom: string;
    periodTo: string;
    amountRub: number;
    /** Fixed nomenclature line (УПД). */
    subject: string;
    /** SBIS Примечание: personal account + period. */
    note: string;
    personalAccountNumber?: string | null;
    /** Parties for ON_NSCHFDOPPR 5.03 (formalized attachment). */
    seller?: InvoiceChetopParty;
    buyer?: InvoiceChetopParty;
}

export type SbisUpdDraftResult = SbisInvoiceDraftResult;

export interface SbisEdoSendResult {
    documentId: string;
    actionName: string;
    stageId: string | null;
    stateCode: string | null;
    stateName: string | null;
}
