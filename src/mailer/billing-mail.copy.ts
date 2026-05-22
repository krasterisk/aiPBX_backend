import { billingNoticeParagraph } from './billing-mail.layout';

export type BillingInvoiceAmountMode = 'fixed' | 'average_monthly';

/** Closing line shared by billing notification templates. */
export function billingThanksParagraph(isRu: boolean): string {
    const text = isRu
        ? 'Благодарим вас за использование AI PBX.'
        : 'Thank you for using AI PBX.';
    return `<p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">${text}</p>`;
}

export interface BillingInvoiceAttachmentNoteParams {
    isRu: boolean;
    mode: BillingInvoiceAmountMode;
    /** Invoice coverage period (e.g. 30 days of estimated spend). */
    estimatePeriodDays?: number;
    /** Days used to compute average daily spend (runway); defaults to estimatePeriodDays. */
    spendLookbackDays?: number;
}

/** Info block when a PDF invoice is attached to a billing email. */
export function billingInvoiceAttachmentNote(params: BillingInvoiceAttachmentNoteParams): string {
    const cabinetHint = params.isRu
        ? 'Вы можете использовать его для пополнения баланса или сформировать в личном кабинете счёт на другую сумму.'
        : 'You may use it to top up your balance or issue an invoice for a different amount in your account.';

    if (params.mode === 'average_monthly') {
        const periodDays = params.estimatePeriodDays ?? 30;
        const lookback = params.spendLookbackDays ?? periodDays;
        const spendPart = params.isRu
            ? lookback === periodDays
                ? `исходя из вашего среднего расхода за ${periodDays} дн.`
                : `исходя из вашего среднего расхода за последние ${lookback} дн.`
            : lookback === periodDays
              ? `based on your average spend over the last ${periodDays} days`
              : `based on your average spend over the last ${lookback} days`;
        const text = params.isRu
            ? `К письму приложен счёт на оплату на расчётную сумму за ${periodDays} дн. (${spendPart}). ${cabinetHint}`
            : `A payment invoice is attached for an estimated ${periodDays}-day amount (${spendPart}). ${cabinetHint}`;
        return billingNoticeParagraph(text, 'info');
    }

    const text = params.isRu
        ? `К письму приложен счёт на оплату. ${cabinetHint}`
        : `A payment invoice is attached. ${cabinetHint}`;
    return billingNoticeParagraph(text, 'info');
}
