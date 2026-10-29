import { billingMetricBox, billingNoticeParagraph, resolvePaymentPageUrl, wrapBillingMailHtml } from './billing-mail.layout';
import { BillingMailMoney, escapeMailText, formatBillingMoney, formatCurrencyAmount } from './billing-mail.money';

export interface BalanceCreditMailParams {
    clientName: string;
    personalAccountNumber: string;
    amountUsd: number;
    balanceAfterUsd: number;
    creditedAt: Date;
    originalAmount?: number;
    originalCurrency?: string;
}

export function balanceCreditMail(isRu: boolean, params: BalanceCreditMailParams, money: BillingMailMoney) {
    const amount = params.originalCurrency === money.currency && params.originalAmount != null
        ? formatCurrencyAmount(params.originalAmount, money.currency, isRu)
        : formatBillingMoney(params.amountUsd, isRu, money);
    const balance = formatBillingMoney(params.balanceAfterUsd, isRu, money);
    const client = escapeMailText(params.clientName);
    const account = escapeMailText(params.personalAccountNumber);
    const date = new Intl.DateTimeFormat(isRu ? 'ru-RU' : 'en-US', {
        dateStyle: 'long', timeZone: 'Asia/Krasnoyarsk',
    }).format(params.creditedAt);
    const subject = isRu ? `AI PBX — зачислено ${amount} на баланс` : `AI PBX — ${amount} credited to your balance`;
    const intro = isRu
        ? `Здравствуйте!<br/><br/>Платёж для <strong>${client}</strong> получен и зачислен на баланс вашего аккаунта AI PBX.`
        : `Hello,<br/><br/>The payment for <strong>${client}</strong> has been received and credited to your AI PBX account.`;
    const metrics = billingMetricBox([
        { label: isRu ? 'Лицевой счёт' : 'Account', value: account },
        { label: isRu ? 'Дата зачисления' : 'Credit date', value: date },
        { label: isRu ? 'Баланс после зачисления' : 'Balance after credit', value: balance },
    ]);
    const availability = params.balanceAfterUsd > 0
        ? (isRu ? 'Средства уже доступны для оплаты услуг AI PBX.' : 'Your funds are available for AI PBX services.')
        : (isRu ? 'Платёж учтён. Состояние счёта можно проверить в личном кабинете.' : 'Your payment has been recorded. Check your account for the current balance.');
    return {
        subject,
        text: isRu
            ? `Здравствуйте!\n\nПлатёж для ${params.clientName} получен. Зачислено: ${amount}.\nЛицевой счёт: ${params.personalAccountNumber}.\nДата зачисления: ${date}.\nБаланс после зачисления: ${balance}.\n\n${availability}\n${resolvePaymentPageUrl()}\n\nС уважением, команда AI PBX`
            : `Hello!\n\nPayment received for ${params.clientName}: ${amount}.\nAccount: ${params.personalAccountNumber}.\nCredit date: ${date}.\nBalance after credit: ${balance}.\n\n${availability}\n${resolvePaymentPageUrl()}\n\nThe AI PBX team`,
        html: wrapBillingMailHtml({
            isRu, title: isRu ? 'Баланс пополнен' : 'Balance topped up', intro,
            bodyHtml: `<div style="margin:4px 0 20px;padding:22px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;text-align:center;"><p style="margin:0 0 8px;font-size:13px;color:#166534;">${isRu ? 'Зачислено на баланс' : 'Credited to your account'}</p><p style="margin:0;font-size:32px;line-height:1.3;font-weight:700;color:#15803d;">${amount}</p></div>${metrics}${billingNoticeParagraph(availability)}<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#334155;">${isRu ? 'Спасибо за своевременную оплату и доверие к AI PBX.' : 'Thank you for your payment and for choosing AI PBX.'}</p>`,
            cta: { href: resolvePaymentPageUrl(), label: isRu ? 'Посмотреть баланс' : 'View balance', showUrl: false,
                hint: isRu ? 'Детали платежа доступны в личном кабинете.' : 'Payment details are available in your account.' },
        }),
    };
}
