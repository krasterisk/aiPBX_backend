import {
    billingInvoiceAttachmentNote,
    billingThanksParagraph,
    type BillingInvoiceAmountMode,
} from './billing-mail.copy';
import {
    billingMetricBox,
    billingNoticeParagraph,
    resolvePaymentPageUrl,
    wrapBillingMailHtml,
} from './billing-mail.layout';

export interface LowBalanceMailInvoice {
    amountMode: BillingInvoiceAmountMode;
}

export interface RunwayMailParams {
    balanceUsd: number;
    daysLeft: number;
    alertDays: number;
    lookbackDays: number;
    dailyBurnUsd: number;
    invoiceNumber?: string;
}

export function lowBalanceMail(
    isRu: boolean,
    balance: number,
    limit: number,
    invoice?: LowBalanceMailInvoice,
) {
    const paymentUrl = resolvePaymentPageUrl();
    const metrics = billingMetricBox([
        { label: isRu ? 'Текущий баланс' : 'Current balance', value: `$${balance.toFixed(2)}` },
        { label: isRu ? 'Установленный порог' : 'Your threshold', value: `$${limit.toFixed(2)}` },
    ]);
    const hasInvoice = !!invoice;
    const invoiceNote = invoice
        ? billingInvoiceAttachmentNote({
              isRu,
              mode: invoice.amountMode,
              estimatePeriodDays: 30,
          })
        : '';

    if (isRu) {
        return {
            subject: hasInvoice
                ? 'AI PBX — уведомление о балансе и счёт на оплату'
                : 'AI PBX — уведомление о балансе',
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Уведомление о балансе',
                intro:
                    'Здравствуйте!<br/><br/>Обращаем ваше внимание: баланс вашего аккаунта опустился ниже установленного вами порога. Чтобы сервис продолжал работать без перерывов, рекомендуем пополнить счёт заранее.',
                bodyHtml: `${billingNoticeParagraph(
                    'Баланс ниже заданного порога — при дальнейшем расходе услуги могут быть ограничены.',
                    'warning',
                )}${metrics}${invoiceNote}${billingThanksParagraph(true)}`,
                paymentUrl,
            }),
        };
    }

    return {
        subject: hasInvoice
            ? 'AI PBX — balance notice and payment invoice'
            : 'AI PBX — balance notice',
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Balance notice',
            intro:
                'Hello,<br/><br/>We would like to inform you that your account balance has fallen below the threshold you set. To keep your service running smoothly, we recommend topping up in advance.',
            bodyHtml: `${billingNoticeParagraph(
                'Your balance is below the configured threshold — continued usage may lead to service restrictions.',
                'warning',
            )}${metrics}${invoiceNote}${billingThanksParagraph(false)}`,
            paymentUrl,
        }),
    };
}

export function criticalBalanceMail(isRu: boolean, balance: number) {
    const paymentUrl = resolvePaymentPageUrl();
    const metrics = billingMetricBox([
        { label: isRu ? 'Текущий баланс' : 'Current balance', value: `$${balance.toFixed(2)}`, accent: true },
    ]);

    if (isRu) {
        return {
            subject: 'AI PBX — рекомендуем пополнить баланс',
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Низкий баланс',
                intro:
                    'Здравствуйте!<br/><br/>Мы бережно напоминаем: на вашем счёте осталось менее $3. Пожалуйста, пополните баланс, чтобы избежать приостановки сервиса.',
                bodyHtml: `${billingNoticeParagraph(
                    'При нулевом балансе исходящие звонки и связанные функции будут временно недоступны.',
                    'warning',
                )}${metrics}<p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Заранее благодарим за своевременное пополнение.</p>`,
                paymentUrl,
            }),
        };
    }

    return {
        subject: 'AI PBX — please top up your balance',
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Low balance reminder',
            intro:
                'Hello,<br/><br/>This is a friendly reminder: your account balance is below $3. Please consider topping up to avoid any interruption to your service.',
            bodyHtml: `${billingNoticeParagraph(
                'When your balance reaches zero, outbound calls and related features will be temporarily unavailable.',
                'warning',
            )}${metrics}<p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">Thank you in advance for keeping your account funded.</p>`,
            paymentUrl,
        }),
    };
}

export function zeroBalanceMail(isRu: boolean, balance: number) {
    const paymentUrl = resolvePaymentPageUrl();
    const metrics = billingMetricBox([
        { label: isRu ? 'Текущий баланс' : 'Current balance', value: `$${balance.toFixed(2)}`, accent: true },
    ]);

    if (isRu) {
        return {
            subject: 'AI PBX — сервис временно приостановлен',
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Сервис временно приостановлен',
                intro:
                    'Здравствуйте!<br/><br/>К сожалению, баланс вашего аккаунта исчерпан, и мы вынуждены временно приостановить оказание услуг. Как только вы пополните счёт, работа сервиса будет восстановлена автоматически.',
                bodyHtml: `${billingNoticeParagraph(
                    'Пополнение баланса занимает несколько минут — после зачисления средств доступ к сервису восстановится без дополнительных действий с вашей стороны.',
                    'critical',
                )}${metrics}`,
                paymentUrl,
            }),
        };
    }

    return {
        subject: 'AI PBX — service temporarily suspended',
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Service temporarily suspended',
            intro:
                'Hello,<br/><br/>Your account balance has been depleted, and we have temporarily suspended service. Once you add funds, your access will be restored automatically.',
            bodyHtml: `${billingNoticeParagraph(
                'Top-up takes just a few minutes — after payment is credited, your service will resume without any further action on your part.',
                'critical',
            )}${metrics}`,
            paymentUrl,
        }),
    };
}

export function runwayBalanceMail(isRu: boolean, p: RunwayMailParams) {
    const paymentUrl = resolvePaymentPageUrl();
    const daysText = p.daysLeft.toFixed(1);
    const metrics = billingMetricBox([
        { label: isRu ? 'Прогноз (дней)' : 'Estimated runway (days)', value: `~${daysText}`, accent: true },
        { label: isRu ? 'Текущий баланс' : 'Current balance', value: `$${p.balanceUsd.toFixed(2)}` },
        {
            label: isRu ? 'Средний расход в день' : 'Average daily spend',
            value: `~$${p.dailyBurnUsd.toFixed(2)}`,
        },
        {
            label: isRu ? 'Период расчёта' : 'Calculation period',
            value: isRu ? `${p.lookbackDays} дн.` : `${p.lookbackDays} days`,
        },
    ]);

    if (isRu) {
        const invoiceNote = p.invoiceNumber
            ? billingInvoiceAttachmentNote({
                  isRu: true,
                  mode: 'average_monthly',
                  estimatePeriodDays: 30,
                  spendLookbackDays: p.lookbackDays,
              })
            : '';
        return {
            subject: p.invoiceNumber
                ? 'AI PBX — прогноз баланса и счёт на оплату'
                : 'AI PBX — прогноз баланса',
            html: wrapBillingMailHtml({
                isRu: true,
                title: 'Прогноз баланса',
                intro: `Здравствуйте!<br/><br/>На основании расходов за последние ${p.lookbackDays} дн. мы прогнозируем, что средств на балансе может хватить менее чем на ${p.alertDays} дн. Рекомендуем пополнить счёт заранее, чтобы сервис работал без перерывов.`,
                bodyHtml: `${billingNoticeParagraph(
                    `По нашим расчётам, при текущем темпе расходов баланса хватит примерно на ${daysText} дн.`,
                    'warning',
                )}${metrics}${invoiceNote}${billingThanksParagraph(true)}`,
                paymentUrl,
            }),
        };
    }

    const invoiceNote = p.invoiceNumber
        ? billingInvoiceAttachmentNote({
              isRu: false,
              mode: 'average_monthly',
              estimatePeriodDays: 30,
              spendLookbackDays: p.lookbackDays,
          })
        : '';
    return {
        subject: p.invoiceNumber
            ? 'AI PBX — balance forecast and payment invoice'
            : 'AI PBX — balance forecast',
        html: wrapBillingMailHtml({
            isRu: false,
            title: 'Balance forecast',
            intro: `Hello,<br/><br/>Based on your spending over the last ${p.lookbackDays} days, we estimate your balance may last fewer than ${p.alertDays} days. We recommend topping up in advance to avoid any interruption.`,
            bodyHtml: `${billingNoticeParagraph(
                `At your current spend rate, your balance may last approximately ${daysText} days.`,
                'warning',
            )}${metrics}${invoiceNote}${billingThanksParagraph(false)}`,
            paymentUrl,
        }),
    };
}
