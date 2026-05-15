/** Tenant billing currency from ENV (per deployment: aipbx.ru → RUB, others → USD). */
export type TenantCurrencyCode = 'USD' | 'RUB';

export function getTenantCurrency(): TenantCurrencyCode {
    const raw = (process.env.TENANT_CURRENCY || 'USD').toUpperCase();
    return raw === 'RUB' ? 'RUB' : 'USD';
}

export function isRubTenant(): boolean {
    return getTenantCurrency() === 'RUB';
}
