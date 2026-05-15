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
