import { existsSync } from 'fs';
import { join } from 'path';

export const BILLING_MAIL_LOGO_CID = 'aipbx-logo';
export const BILLING_MAIL_LOGO_FILENAME = 'aipbx_logo_v3.png';

/** Payment page: CLIENT_URL + /payment (trailing slash on base is stripped). */
export function resolvePaymentPageUrl(): string {
    const base = (process.env.CLIENT_URL || '').trim().replace(/\/+$/, '');
    return base ? `${base}/payment` : '/payment';
}

/** Logo path: dist after build, src in dev/tests. */
export function resolveBillingMailLogoPath(): string | null {
    const candidates = [
        join(__dirname, 'assets', BILLING_MAIL_LOGO_FILENAME),
        join(process.cwd(), 'dist', 'mailer', 'assets', BILLING_MAIL_LOGO_FILENAME),
        join(process.cwd(), 'src', 'mailer', 'assets', BILLING_MAIL_LOGO_FILENAME),
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    return null;
}

export function billingMailLogoAttachment(): { filename: string; path: string; cid: string } | null {
    const path = resolveBillingMailLogoPath();
    if (!path) return null;
    return { filename: BILLING_MAIL_LOGO_FILENAME, path, cid: BILLING_MAIL_LOGO_CID };
}

export interface MailCtaParams {
    href: string;
    label: string;
    hint?: string;
    showUrl?: boolean;
}

export interface BillingMailLayoutParams {
    isRu: boolean;
    title: string;
    intro: string;
    bodyHtml: string;
    paymentUrl?: string;
    /** Custom CTA (e.g. password reset). */
    cta?: MailCtaParams;
    /** When false, no CTA block (auth codes). Default: payment button for billing. */
    showCta?: boolean;
}

function renderMailCtaBlock(cta: MailCtaParams): string {
    const urlLine = cta.showUrl !== false
        ? `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8;word-break:break-all;"><a href="${cta.href}" style="color:#0EA5E9;">${cta.href}</a></p>`
        : '';
    const hint = cta.hint
        ? `<p style="margin:12px 0 0;font-size:13px;color:#64748b;">${cta.hint}</p>`
        : '';
    return `<tr><td style="padding:24px 32px 8px;text-align:center;">
<a href="${cta.href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#06B6D4 0%,#0EA5E9 50%,#8B5CF6 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">${cta.label}</a>
${hint}
${urlLine}
</td></tr>`;
}

function resolveLayoutCta(params: BillingMailLayoutParams): MailCtaParams | null {
    if (params.cta) return params.cta;
    if (params.showCta === false) return null;
    const href = params.paymentUrl ?? resolvePaymentPageUrl();
    return params.isRu
        ? { href, label: 'Перейти к оплате', hint: 'Пополнение баланса занимает несколько минут.', showUrl: true }
        : { href, label: 'Go to payment', hint: 'Top-up takes just a few minutes.', showUrl: true };
}

/** Responsive-friendly table layout for major email clients. */
export function wrapBillingMailHtml(params: BillingMailLayoutParams): string {
    const ctaBlock = resolveLayoutCta(params);
    const footer = params.isRu
        ? 'С уважением,<br/>команда AI PBX'
        : 'Best regards,<br/>the AI PBX team';

    return `<!DOCTYPE html>
<html lang="${params.isRu ? 'ru' : 'en'}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${params.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f6f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
<tr><td style="padding:32px 32px 16px;text-align:center;background:linear-gradient(135deg,#f0f9ff 0%,#faf5ff 100%);">
<img src="cid:${BILLING_MAIL_LOGO_CID}" alt="AI PBX" width="80" height="80" style="display:block;margin:0 auto 16px;border:0;"/>
<h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.3;color:#0f172a;">${params.title}</h1>
</td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#334155;">
<p style="margin:0 0 16px;">${params.intro}</p>
${params.bodyHtml}
</td></tr>
${ctaBlock ? renderMailCtaBlock(ctaBlock) : ''}
<tr><td style="padding:16px 32px 32px;font-size:14px;line-height:1.6;color:#64748b;border-top:1px solid #e2e8f0;">
<p style="margin:0;">${footer}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Highlight box for metrics (balance, runway, etc.). */
export function billingMetricBox(rows: Array<{ label: string; value: string; accent?: boolean }>): string {
    const items = rows
        .map(
            (r) => `<tr>
<td style="padding:8px 0;font-size:14px;color:#64748b;">${r.label}</td>
<td style="padding:8px 0;font-size:14px;font-weight:600;text-align:right;color:${r.accent ? '#b45309' : '#0f172a'};">${r.value}</td>
</tr>`,
        )
        .join('');
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
<tr><td style="padding:16px 20px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
</td></tr>
</table>`;
}

/** Prominent one-time code (auth, 2FA-style emails). */
export function mailAuthCodeBox(code: string, label: string): string {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
<tr><td style="padding:20px 24px;text-align:center;">
<p style="margin:0 0 8px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">${label}</p>
<p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.2em;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${code}</p>
</td></tr>
</table>`;
}

export function billingNoticeParagraph(text: string, tone: 'info' | 'warning' | 'critical' = 'info'): string {
    const styles = {
        info: 'background:#eff6ff;border-left:4px solid #0EA5E9;color:#1e40af;',
        warning: 'background:#fffbeb;border-left:4px solid #f59e0b;color:#92400e;',
        critical: 'background:#fef2f2;border-left:4px solid #ef4444;color:#991b1b;',
    };
    return `<p style="margin:0 0 16px;padding:12px 16px;border-radius:0 8px 8px 0;font-size:14px;line-height:1.5;${styles[tone]}">${text}</p>`;
}
