import { isRubTenant } from './tenant-currency';

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * RU B2B invoice billing (aipbx.ru prod or local dev), aligned with frontend
 * isPaymentOrganizationsTabVisible.
 */
export function isInvoiceBillingEnabled(): boolean {
    if (isRubTenant()) {
        return true;
    }
    if (process.env.NODE_ENV !== 'production') {
        return true;
    }
    return false;
}

export function normalizeBillingHost(hostHeader?: string): string {
    return (hostHeader || '').split(':')[0].toLowerCase().trim();
}

function isLocalDevBillingHost(host: string): boolean {
    return LOCAL_DEV_HOSTNAMES.has(host);
}

/**
 * HTTP invoice API: Host must match INVOICE_BILLING_ALLOWED_HOSTS (or localhost in dev).
 * Internal calls with empty Host are allowed when INVOICE_BILLING_DEFAULT_HOST is unset.
 */
export function isInvoiceBillingHostAllowed(hostHeader?: string): boolean {
    if (!isInvoiceBillingEnabled()) {
        return false;
    }

    const raw = process.env.INVOICE_BILLING_ALLOWED_HOSTS;
    if (!raw || raw === '*') {
        return true;
    }

    let host = normalizeBillingHost(hostHeader);
    if (!host) {
        const fallback = (process.env.INVOICE_BILLING_DEFAULT_HOST || '').trim();
        if (!fallback) {
            return true;
        }
        host = normalizeBillingHost(fallback);
    }

    if (process.env.NODE_ENV !== 'production' && isLocalDevBillingHost(host)) {
        return true;
    }

    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .some((h) => host === h || host.endsWith(`.${h}`));
}
