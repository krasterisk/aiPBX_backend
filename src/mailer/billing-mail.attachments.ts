import type { SendMailOptions } from 'nodemailer';
import { billingMailLogoAttachment } from './billing-mail.layout';

/** Logo CID attachment + optional invoice PDF for billing notifications. */
export function buildBillingMailAttachments(
    invoiceAttachment?: { filename: string; path: string },
): SendMailOptions['attachments'] {
    const attachments: NonNullable<SendMailOptions['attachments']> = [];
    const logo = billingMailLogoAttachment();
    if (logo) {
        attachments.push(logo);
    }
    if (invoiceAttachment?.path) {
        attachments.push({
            filename: invoiceAttachment.filename,
            path: invoiceAttachment.path,
        });
    }
    return attachments.length ? attachments : undefined;
}
