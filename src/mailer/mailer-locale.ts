import { isRubTenant } from '../shared/tenant/tenant-currency';

/** Billing and auth-adjacent mail locale: ru on aipbx.ru, en elsewhere (override via MAIL_LOCALE). */
export function usesRussianMailLocale(): boolean {
    const override = (process.env.MAIL_LOCALE || '').trim().toLowerCase();
    if (override === 'ru') return true;
    if (override === 'en') return false;
    return isRubTenant();
}
