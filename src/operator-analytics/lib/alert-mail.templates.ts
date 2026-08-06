import { wrapBillingMailHtml, billingMetricBox } from '../../mailer/billing-mail.layout';
import { usesRussianMailLocale } from '../../mailer/mailer-locale';

export type CriticalAlertType =
    | 'csat_drop'
    | 'negative_spike'
    | 'anomaly'
    | 'budget_exceeded'
    | 'test';

export interface AnomalyAlertNumbers {
    windowDays: number;
    recent: { count: number; avgCsat: number | null; negativeRate: number };
    baseline: { count: number; avgCsat: number | null; negativeRate: number };
    triggers: {
        csatDrop: number | null;
        negativeSpike: number | null;
    };
    thresholds: {
        dropPct: number;
        spikePp: number;
    };
}

export interface BudgetAlertNumbers {
    month: string;
    monthlyBudgetUsd: number;
    spentUsd: number;
}

export interface CriticalAlertMailPayload {
    type: CriticalAlertType;
    projectName: string;
    dashboardUrl: string;
    anomaly?: AnomalyAlertNumbers;
    budget?: BudgetAlertNumbers;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function titleFor(type: CriticalAlertType, isRu: boolean): string {
    switch (type) {
        case 'csat_drop':
            return isRu ? 'Падение CSAT' : 'CSAT drop';
        case 'negative_spike':
            return isRu ? 'Рост негатива' : 'Negativity spike';
        case 'anomaly':
            return isRu ? 'Аномалия метрик' : 'Metrics anomaly';
        case 'budget_exceeded':
            return isRu ? 'Превышение бюджета' : 'Budget exceeded';
        case 'test':
            return isRu ? 'Тест уведомлений' : 'Alert channel test';
        default:
            return isRu ? 'Критичное уведомление' : 'Critical alert';
    }
}

function resolveAnomalyType(anomaly: AnomalyAlertNumbers): CriticalAlertType {
    const csat = anomaly.triggers.csatDrop != null;
    const neg = anomaly.triggers.negativeSpike != null;
    if (csat && !neg) return 'csat_drop';
    if (neg && !csat) return 'negative_spike';
    return 'anomaly';
}

export function buildCriticalAlertMail(
    payload: CriticalAlertMailPayload,
): { subject: string; html: string; text: string } {
    const isRu = usesRussianMailLocale();
    const type = payload.type === 'anomaly' && payload.anomaly
        ? resolveAnomalyType(payload.anomaly)
        : payload.type;
    const title = titleFor(type, isRu);
    const subject = isRu
        ? `[Критично] ${title}: ${payload.projectName}`
        : `[Critical] ${title}: ${payload.projectName}`;

    let bodyHtml = '';
    const textLines: string[] = [
        isRu ? `Критичное уведомление: ${title}` : `Critical alert: ${title}`,
        isRu ? `Проект: ${payload.projectName}` : `Project: ${payload.projectName}`,
        '',
    ];

    if (type === 'test') {
        bodyHtml = isRu
            ? `<p>Это тестовое уведомление канала критичных событий для проекта <strong>${escapeHtml(payload.projectName)}</strong>.</p>`
            : `<p>This is a test of the critical-alert channel for project <strong>${escapeHtml(payload.projectName)}</strong>.</p>`;
        textLines.push(
            isRu
                ? 'Это тестовое уведомление канала критичных событий.'
                : 'This is a test of the critical-alert channel.',
        );
    } else if (payload.budget) {
        const b = payload.budget;
        bodyHtml = billingMetricBox([
            { label: isRu ? 'Месяц' : 'Month', value: b.month },
            { label: isRu ? 'Бюджет' : 'Budget', value: `$${b.monthlyBudgetUsd.toFixed(2)}` },
            { label: isRu ? 'Потрачено' : 'Spent', value: `$${b.spentUsd.toFixed(2)}`, accent: true },
        ]);
        textLines.push(
            isRu ? `Месяц: ${b.month}` : `Month: ${b.month}`,
            isRu
                ? `Потрачено $${b.spentUsd.toFixed(2)} при бюджете $${b.monthlyBudgetUsd.toFixed(2)}`
                : `Spent $${b.spentUsd.toFixed(2)} against budget $${b.monthlyBudgetUsd.toFixed(2)}`,
        );
    } else if (payload.anomaly) {
        const a = payload.anomaly;
        const metrics: Array<{ label: string; value: string; accent?: boolean }> = [
            {
                label: isRu ? 'Окно (дни)' : 'Window (days)',
                value: String(a.windowDays),
            },
            {
                label: isRu ? 'Звонков (recent / baseline)' : 'Calls (recent / baseline)',
                value: `${a.recent.count} / ${a.baseline.count}`,
            },
        ];
        if (a.recent.avgCsat != null || a.baseline.avgCsat != null) {
            metrics.push({
                label: 'CSAT',
                value: `${a.recent.avgCsat ?? '—'} → ${a.baseline.avgCsat ?? '—'}`,
            });
        }
        metrics.push({
            label: isRu ? 'Негатив %' : 'Negative %',
            value: `${a.recent.negativeRate}% → ${a.baseline.negativeRate}%`,
        });
        if (a.triggers.csatDrop != null) {
            metrics.push({
                label: isRu ? 'Падение CSAT' : 'CSAT drop',
                value: `${a.triggers.csatDrop}% (≥ ${a.thresholds.dropPct}%)`,
                accent: true,
            });
        }
        if (a.triggers.negativeSpike != null) {
            metrics.push({
                label: isRu ? 'Рост негатива' : 'Negativity spike',
                value: `${a.triggers.negativeSpike} п.п. (≥ ${a.thresholds.spikePp})`,
                accent: true,
            });
        }
        bodyHtml = billingMetricBox(metrics);
        textLines.push(
            isRu
                ? `Окно: ${a.windowDays} дн., звонков recent/baseline: ${a.recent.count}/${a.baseline.count}`
                : `Window: ${a.windowDays}d, calls recent/baseline: ${a.recent.count}/${a.baseline.count}`,
        );
        if (a.triggers.csatDrop != null) {
            textLines.push(
                isRu
                    ? `CSAT упал на ${a.triggers.csatDrop}% (порог ${a.thresholds.dropPct}%)`
                    : `CSAT dropped ${a.triggers.csatDrop}% (threshold ${a.thresholds.dropPct}%)`,
            );
        }
        if (a.triggers.negativeSpike != null) {
            textLines.push(
                isRu
                    ? `Негатив вырос на ${a.triggers.negativeSpike} п.п. (порог ${a.thresholds.spikePp})`
                    : `Negativity rose ${a.triggers.negativeSpike} pp (threshold ${a.thresholds.spikePp})`,
            );
        }
    }

    const cta = isRu ? 'Открыть дашборд' : 'Open dashboard';
    const intro = isRu
        ? `Критичное уведомление: <strong style="color:#b91c1c;">${escapeHtml(title)}</strong> по проекту <strong>${escapeHtml(payload.projectName)}</strong>.`
        : `Critical alert: <strong style="color:#b91c1c;">${escapeHtml(title)}</strong> for project <strong>${escapeHtml(payload.projectName)}</strong>.`;

    const html = wrapBillingMailHtml({
        isRu,
        title,
        intro,
        bodyHtml,
        cta: {
            href: payload.dashboardUrl,
            label: cta,
            hint: isRu
                ? 'Подробности и разбор звонков — в дашборде аналитики.'
                : 'Details and call drilldown are in the analytics dashboard.',
            showUrl: true,
        },
    });

    textLines.push('', `${cta}: ${payload.dashboardUrl}`);
    return { subject, html, text: textLines.join('\n') };
}

export function buildCriticalAlertTelegramCaption(payload: CriticalAlertMailPayload): string {
    const isRu = usesRussianMailLocale();
    const type = payload.type === 'anomaly' && payload.anomaly
        ? resolveAnomalyType(payload.anomaly)
        : payload.type;
    const title = titleFor(type, isRu);
    const lines = [
        `🚨 <b>${escapeHtml(title)}</b>`,
        isRu
            ? `Проект: <b>${escapeHtml(payload.projectName)}</b>`
            : `Project: <b>${escapeHtml(payload.projectName)}</b>`,
    ];

    if (type === 'test') {
        lines.push(
            isRu
                ? 'Тестовое уведомление канала критичных событий.'
                : 'Critical-alert channel test message.',
        );
    } else if (payload.budget) {
        const b = payload.budget;
        lines.push(
            isRu
                ? `Потрачено <b>$${b.spentUsd.toFixed(2)}</b> / бюджет $${b.monthlyBudgetUsd.toFixed(2)} (${b.month})`
                : `Spent <b>$${b.spentUsd.toFixed(2)}</b> / budget $${b.monthlyBudgetUsd.toFixed(2)} (${b.month})`,
        );
    } else if (payload.anomaly) {
        const a = payload.anomaly;
        if (a.triggers.csatDrop != null) {
            lines.push(
                isRu
                    ? `CSAT: ${a.recent.avgCsat ?? '—'} vs ${a.baseline.avgCsat ?? '—'} (−${a.triggers.csatDrop}%, порог ${a.thresholds.dropPct}%)`
                    : `CSAT: ${a.recent.avgCsat ?? '—'} vs ${a.baseline.avgCsat ?? '—'} (−${a.triggers.csatDrop}%, thr ${a.thresholds.dropPct}%)`,
            );
        }
        if (a.triggers.negativeSpike != null) {
            lines.push(
                isRu
                    ? `Негатив: ${a.recent.negativeRate}% vs ${a.baseline.negativeRate}% (+${a.triggers.negativeSpike} п.п., порог ${a.thresholds.spikePp})`
                    : `Negative: ${a.recent.negativeRate}% vs ${a.baseline.negativeRate}% (+${a.triggers.negativeSpike} pp, thr ${a.thresholds.spikePp})`,
            );
        }
        lines.push(
            isRu
                ? `Выборка: ${a.recent.count} / ${a.baseline.count} звонков за ${a.windowDays} дн.`
                : `Sample: ${a.recent.count} / ${a.baseline.count} calls over ${a.windowDays}d`,
        );
    }

    lines.push(
        isRu
            ? `<a href="${payload.dashboardUrl}">Открыть дашборд</a>`
            : `<a href="${payload.dashboardUrl}">Open dashboard</a>`,
    );
    return lines.join('\n');
}
