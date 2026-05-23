import { HARDCODED_SUBJECT_FALLBACK } from './billing.constants';

export interface SubjectResolveInput {
    bodySubject?: string | null;
    organizationSubject?: string | null;
    envDefault?: string | null;
}

export function resolveInvoiceSubject(input: SubjectResolveInput): string {
    const trimmed = (s: string | null | undefined) => (s && String(s).trim()) || '';
    if (trimmed(input.bodySubject)) return trimmed(input.bodySubject);
    if (trimmed(input.organizationSubject)) return trimmed(input.organizationSubject);
    if (trimmed(input.envDefault)) return trimmed(input.envDefault);
    return HARDCODED_SUBJECT_FALLBACK;
}

/** Base nomenclature for ON_CHETOP (without «л/с …» suffix). */
export function stripLineItemPersonalAccountFromSubject(lineItem: string): string {
    return lineItem.replace(/\s*\(л\/с\s+[^)]+\)\s*$/iu, '').trim();
}

/** Line item on invoice PDF / SBIS: base nomenclature + personal account for identification. */
export function formatInvoiceLineItemSubject(subject: string, personalAccountNumber?: string | null): string {
    const base = subject.trim();
    const pa = (personalAccountNumber || '').trim();
    if (!base) return pa ? `Пополнение лицевого счёта ${pa}` : '';
    if (!pa || base.includes(pa)) return base;
    return `${base} (л/с ${pa})`;
}
