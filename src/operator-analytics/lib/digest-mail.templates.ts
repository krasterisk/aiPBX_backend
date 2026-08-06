import { billingMetricBox, wrapBillingMailHtml } from '../../mailer/billing-mail.layout';
import { usesRussianMailLocale } from '../../mailer/mailer-locale';
import type { DigestChartPng } from './digest-charts';

export interface DigestMailOperatorRow {
    name: string;
    calls: number;
    score: number;
    successRate: number;
}

export interface DigestMailTagRow {
    name: string;
    calls: number;
    score: number;
}

export interface DigestMailPayload {
    projectName: string;
    periodLabel: string;
    dashboardUrl: string;
    kpis: {
        totalCalls: number;
        averageScore: number;
        averageDurationSec: number;
        successRate: number;
        totalCost: number;
        costLabel: string;
    };
    topOperators: DigestMailOperatorRow[];
    bottomOperators: DigestMailOperatorRow[];
    topTags: DigestMailTagRow[];
    charts: DigestChartPng[];
}

function formatDuration(sec: number, isRu: boolean): string {
    const s = Math.round(sec || 0);
    if (s < 60) return isRu ? `${s} сек` : `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return isRu ? `${m} мин ${r} сек` : `${m}m ${r}s`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function tableHtml(
    headers: string[],
    rows: string[][],
): string {
    const head = headers.map(h => `<th style="padding:8px;text-align:left;font-size:12px;color:#64748b;border-bottom:1px solid #e2e8f0;">${escapeHtml(h)}</th>`).join('');
    const body = rows.map(r =>
        `<tr>${r.map((c, i) => `<td style="padding:8px;font-size:13px;color:#0f172a;border-bottom:1px solid #f1f5f9;${i > 0 ? 'text-align:right;' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`,
    ).join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 16px;border-collapse:collapse;">
<tr>${head}</tr>${body}</table>`;
}

export function buildDigestMail(payload: DigestMailPayload): { subject: string; html: string; text: string } {
    const isRu = usesRussianMailLocale();
    const { kpis } = payload;
    const subject = isRu
        ? `Сводка аналитики: ${payload.projectName} (${payload.periodLabel})`
        : `Analytics digest: ${payload.projectName} (${payload.periodLabel})`;

    const intro = isRu
        ? `Сводка по проекту <strong>${escapeHtml(payload.projectName)}</strong> за период <strong>${escapeHtml(payload.periodLabel)}</strong>.`
        : `Digest for project <strong>${escapeHtml(payload.projectName)}</strong> covering <strong>${escapeHtml(payload.periodLabel)}</strong>.`;

    const kpiBox = billingMetricBox([
        { label: isRu ? 'Звонков' : 'Calls', value: String(kpis.totalCalls) },
        { label: isRu ? 'Средний балл' : 'Avg score', value: kpis.averageScore.toFixed(1) },
        { label: isRu ? 'AHT' : 'AHT', value: formatDuration(kpis.averageDurationSec, isRu) },
        { label: isRu ? 'Успешность' : 'Success rate', value: `${kpis.successRate.toFixed(1)}%` },
        { label: kpis.costLabel, value: kpis.totalCost.toFixed(2), accent: true },
    ]);

    const chartBlocks = payload.charts.map(c =>
        `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(c.caption)}</p>
<img src="cid:${c.cid}" alt="${escapeHtml(c.caption)}" width="320" style="display:block;max-width:100%;border:1px solid #e2e8f0;border-radius:8px;"/>`,
    ).join('');

    const opHeaders = isRu
        ? ['Оператор', 'Звонков', 'Балл', 'Успех %']
        : ['Operator', 'Calls', 'Score', 'Success %'];
    const toOpRows = (list: DigestMailOperatorRow[]) =>
        list.map(o => [o.name, String(o.calls), o.score.toFixed(1), o.successRate.toFixed(1)]);

    let tables = '';
    if (payload.topOperators.length) {
        tables += `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;">${isRu ? 'Топ операторов' : 'Top operators'}</p>`;
        tables += tableHtml(opHeaders, toOpRows(payload.topOperators));
    }
    if (payload.bottomOperators.length) {
        tables += `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;">${isRu ? 'Нижние операторы' : 'Bottom operators'}</p>`;
        tables += tableHtml(opHeaders, toOpRows(payload.bottomOperators));
    }
    if (payload.topTags.length) {
        const tagHeaders = isRu ? ['Тема', 'Звонков', 'Балл'] : ['Topic', 'Calls', 'Score'];
        tables += `<p style="margin:16px 0 4px;font-size:14px;font-weight:600;">${isRu ? 'Топ тем' : 'Top topics'}</p>`;
        tables += tableHtml(
            tagHeaders,
            payload.topTags.map(t => [t.name, String(t.calls), t.score.toFixed(1)]),
        );
    }

    const html = wrapBillingMailHtml({
        isRu,
        title: isRu ? 'Сводка аналитики' : 'Analytics digest',
        intro,
        bodyHtml: `${kpiBox}${chartBlocks}${tables}`,
        cta: {
            href: payload.dashboardUrl,
            label: isRu ? 'Открыть дашборд' : 'Open dashboard',
            hint: isRu ? 'Интерактивные графики и разбор звонков — в личном кабинете.' : 'Interactive charts and call analysis are in the dashboard.',
            showUrl: true,
        },
        showCta: true,
    });

    const textLines = [
        subject,
        '',
        `${isRu ? 'Звонков' : 'Calls'}: ${kpis.totalCalls}`,
        `${isRu ? 'Средний балл' : 'Avg score'}: ${kpis.averageScore.toFixed(1)}`,
        `${isRu ? 'Успешность' : 'Success'}: ${kpis.successRate.toFixed(1)}%`,
        '',
        payload.dashboardUrl,
    ];

    return { subject, html, text: textLines.join('\n') };
}

export function buildDigestTelegramCaption(payload: DigestMailPayload): string {
    const isRu = usesRussianMailLocale();
    const { kpis } = payload;
    const lines = [
        isRu
            ? `<b>📊 Сводка: ${escapeHtml(payload.projectName)}</b>`
            : `<b>📊 Digest: ${escapeHtml(payload.projectName)}</b>`,
        escapeHtml(payload.periodLabel),
        '',
        isRu
            ? `Звонков: <b>${kpis.totalCalls}</b> · Балл: <b>${kpis.averageScore.toFixed(1)}</b> · Успех: <b>${kpis.successRate.toFixed(1)}%</b>`
            : `Calls: <b>${kpis.totalCalls}</b> · Score: <b>${kpis.averageScore.toFixed(1)}</b> · Success: <b>${kpis.successRate.toFixed(1)}%</b>`,
    ];

    if (payload.topOperators.length) {
        lines.push('');
        lines.push(isRu ? '<b>Топ операторов</b>' : '<b>Top operators</b>');
        for (const o of payload.topOperators.slice(0, 5)) {
            lines.push(`• ${escapeHtml(o.name)} — ${o.score.toFixed(1)} (${o.calls})`);
        }
    }
    if (payload.topTags.length) {
        lines.push('');
        lines.push(isRu ? '<b>Топ тем</b>' : '<b>Top topics</b>');
        for (const t of payload.topTags.slice(0, 5)) {
            lines.push(`• ${escapeHtml(t.name)} — ${t.score.toFixed(1)} (${t.calls})`);
        }
    }
    lines.push('');
    lines.push(`<a href="${payload.dashboardUrl}">${isRu ? 'Открыть дашборд' : 'Open dashboard'}</a>`);
    return lines.join('\n');
}
