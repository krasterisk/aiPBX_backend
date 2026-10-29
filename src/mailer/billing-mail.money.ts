export interface BillingMailMoney { currency: string; rate: number }
export const USD_MAIL_MONEY: BillingMailMoney = { currency: 'USD', rate: 1 };

export function escapeMailText(value: string): string {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

export function formatCurrencyAmount(amount: number, currency: string, isRu: boolean): string {
    return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : isRu ? 'ru-RU' : 'en-US', {
        style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
}

export function formatBillingMoney(usd: number, isRu: boolean, money = USD_MAIL_MONEY): string {
    return formatCurrencyAmount(usd * money.rate, money.currency, isRu);
}
