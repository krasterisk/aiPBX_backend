/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Organization } from '../../organizations/organizations.model';
import { amountInWordsRu } from './invoice-num2str-ru';
import { INVOICE_FONT_REG_NAME, resolveInvoicePdfFontPath } from './invoice-pdf-font';

const PT_PER_MM = 72 / 25.4;

function mm(n: number): number {
    return n * PT_PER_MM;
}

export interface InvoiceIssuerRequisites {
    /** Верхняя левая ячейка «Банк получателя» (как в chet2pdf) */
    bankBranchName: string;
    bic: string;
    correspondentAccount: string;
    inn: string;
    kpp: string;
    settlementAccount: string;
    /** Краткое наименование в блоке «Получатель» */
    recipientShortName: string;
    /** Полная строка для «Поставщик» жирным */
    supplierLineBold: string;
}

export interface InvoicePdfParams {
    number: string;
    documentDate: string;
    amountRub: number;
    subject: string;
    paymentPurpose: string;
    payer: Organization;
    issuer: InvoiceIssuerRequisites;
}

function formatDateRu(iso: string): string {
    const p = iso.trim().split('-');
    if (p.length === 3 && p[0].length === 4) {
        return `${p[2]}.${p[1]}.${p[0]}`;
    }
    return iso;
}

function formatMoneyRu(n: number): string {
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function payerLineBold(org: Organization): string {
    const parts = [org.name];
    if (org.tin) parts.push(`ИНН ${org.tin}`);
    if (org.kpp) parts.push(`КПП ${org.kpp}`);
    if (org.address) parts.push(org.address);
    return parts.join(', ');
}

function textInCell(
    doc: any,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    opts?: { fontSize?: number; align?: 'left' | 'center' | 'right' },
): void {
    const fs = opts?.fontSize ?? 8;
    const pad = 2;
    doc.font(INVOICE_FONT_REG_NAME).fontSize(fs);
    doc.text(text, x + pad, y + pad, {
        width: Math.max(4, w - pad * 2),
        height: Math.max(4, h - pad * 2),
        align: opts?.align ?? 'left',
    });
}

function hrBlack(doc: any, x: number, y: number, w: number): void {
    doc.save();
    doc.fillColor('#000000').rect(x, y, w, 2).fill();
    doc.restore();
}

function writePdfToPath(params: InvoicePdfParams, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const fontPath = resolveInvoicePdfFontPath();
        const doc = new PDFDocument({ size: 'A4', margin: 36, autoFirstPage: true }) as any;
        doc.registerFont(INVOICE_FONT_REG_NAME, fontPath);

        const stream = createWriteStream(outPath);
        doc.pipe(stream);

        const margin = 36;
        const pageW = doc.page.width;
        const W = pageW - margin * 2;
        let y = margin;
        const { issuer } = params;
        const dateRu = formatDateRu(params.documentDate);
        const sumStr = formatMoneyRu(params.amountRub);
        const words = amountInWordsRu(params.amountRub);

        doc.font(INVOICE_FONT_REG_NAME).fillColor('#000000');

        /* --- Верхние предупреждения (как в chet2pdf) --- */
        doc.fontSize(9).text(
            'Внимание! Оплата данного счета означает согласие с условиями договора.',
            margin,
            y,
            { width: W, align: 'right' },
        );
        y += mm(6);
        doc.text('Счет действителен к оплате в течении трех дней.', margin, y, { width: W, align: 'right' });
        y += mm(8);

        doc.fontSize(10).font(INVOICE_FONT_REG_NAME).text('Образец заполнения платежного поручения', margin, y, {
            width: W,
            align: 'center',
        });
        y += mm(8);

        /* --- Таблица банковских реквизитов (пропорции 105 : 25 : 60 мм) --- */
        const scale = W / (mm(105) + mm(25) + mm(60));
        const cBank = mm(105) * scale;
        const cLab = mm(25) * scale;
        const cVal = mm(60) * scale;
        const x0 = margin;
        const Htop = mm(13);
        const Hhalf = Htop / 2;

        doc.rect(x0, y, cBank, Htop).stroke();
        doc
            .font(INVOICE_FONT_REG_NAME)
            .fontSize(9)
            .text(issuer.bankBranchName || '—', x0 + 2, y + 2, { width: cBank - 4, height: Htop - 4 });
        doc.rect(x0 + cBank, y, cLab, Hhalf).stroke();
        doc.fontSize(8).text('БИК', x0 + cBank + 2, y + 2, { width: cLab - 4 });
        doc.rect(x0 + cBank + cLab, y, cVal, Hhalf).stroke();
        doc.fontSize(9).text(issuer.bic || '—', x0 + cBank + cLab + 2, y + 2, { width: cVal - 4 });
        doc.rect(x0 + cBank, y + Hhalf, cLab, Hhalf).stroke();
        doc.fontSize(8).text('Сч. №', x0 + cBank + 2, y + Hhalf + 2, { width: cLab - 4 });
        doc.rect(x0 + cBank + cLab, y + Hhalf, cVal, Hhalf).stroke();
        doc.fontSize(8).text(issuer.correspondentAccount || '—', x0 + cBank + cLab + 2, y + Hhalf + 2, {
            width: cVal - 4,
        });

        y += Htop;
        const Hinn = mm(6);
        const Hrecv = mm(13);
        const Hright = Hinn + Hrecv;
        const cInn = cBank * (50 / 105);
        const cKpp = cBank - cInn;

        doc.rect(x0, y, cInn, Hinn).stroke();
        textInCell(doc, x0, y, cInn, Hinn, issuer.inn ? `ИНН ${issuer.inn}` : 'ИНН —', { fontSize: 8 });
        doc.rect(x0 + cInn, y, cKpp, Hinn).stroke();
        textInCell(doc, x0 + cInn, y, cKpp, Hinn, issuer.kpp ? `КПП ${issuer.kpp}` : 'КПП —', { fontSize: 8 });
        doc.rect(x0 + cBank, y, cLab, Hright).stroke();
        doc.fontSize(8).text('Сч. №', x0 + cBank + 2, y + 2, { width: cLab - 4 });
        doc.rect(x0 + cBank + cLab, y, cVal, Hright).stroke();
        doc.fontSize(9).text(issuer.settlementAccount || '—', x0 + cBank + cLab + 2, y + 2, { width: cVal - 4 });

        doc.rect(x0, y + Hinn, cBank, Hrecv).stroke();
        doc.fontSize(8).fillColor('#444444').text('Получатель', x0 + 2, y + Hinn + Hrecv - mm(4), {
            width: cBank - 4,
        });
        doc.fillColor('#000000');
        doc.fontSize(9).text(issuer.recipientShortName || '—', x0 + 2, y + Hinn + 2, { width: cBank - 4 });

        y += Hright;
        y += mm(5);

        /* --- Заголовок счёта --- */
        doc.font(INVOICE_FONT_REG_NAME).fontSize(16).text(`Счет № ${params.number} от ${dateRu}`, margin, y, {
            width: W,
        });
        y += mm(10);
        hrBlack(doc, margin, y, W);
        y += mm(4);

        /* --- Поставщик / Покупатель --- */
        const labelW = mm(30);
        doc.fontSize(9).text('Поставщик:', margin, y, { width: labelW, continued: false });
        doc.fontSize(10).text(issuer.supplierLineBold, margin + labelW, y, { width: W - labelW });
        y += mm(12);
        doc.fontSize(9).text('Покупатель:', margin, y, { width: labelW });
        doc.fontSize(10).text(payerLineBold(params.payer), margin + labelW, y, {
            width: W - labelW,
        });
        y += mm(14);

        /* --- Таблица услуг --- */
        const colNo = mm(13);
        const colQty = mm(20);
        const colUnit = mm(17);
        const colPrice = mm(27);
        const colSum = mm(27);
        const colName = W - colNo - colQty - colUnit - colPrice - colSum;
        const rowH = mm(10);
        let x = margin;
        doc.rect(x, y, colNo, rowH).stroke();
        doc.fontSize(8).text('№', x + 2, y + 2, { width: colNo - 4, align: 'center' });
        x += colNo;
        doc.rect(x, y, colName, rowH).stroke();
        doc.text('Товары (работы, услуги)', x + 2, y + 2, { width: colName - 4 });
        x += colName;
        doc.rect(x, y, colQty, rowH).stroke();
        doc.text('Кол-во', x + 2, y + 2, { width: colQty - 4, align: 'right' });
        x += colQty;
        doc.rect(x, y, colUnit, rowH).stroke();
        doc.text('Ед.', x + 2, y + 2, { width: colUnit - 4 });
        x += colUnit;
        doc.rect(x, y, colPrice, rowH).stroke();
        doc.text('Цена', x + 2, y + 2, { width: colPrice - 4, align: 'right' });
        x += colPrice;
        doc.rect(x, y, colSum, rowH).stroke();
        doc.text('Сумма', x + 2, y + 2, { width: colSum - 4, align: 'right' });
        y += rowH;
        x = margin;
        doc.rect(x, y, colNo, rowH).stroke();
        doc.fontSize(9).text('1', x + 2, y + 2, { width: colNo - 4, align: 'center' });
        x += colNo;
        doc.rect(x, y, colName, rowH).stroke();
        doc.fontSize(8).text(params.subject, x + 2, y + 2, { width: colName - 4, height: rowH - 4 });
        x += colName;
        doc.rect(x, y, colQty, rowH).stroke();
        doc.text('1', x + 2, y + 2, { width: colQty - 4, align: 'right' });
        x += colQty;
        doc.rect(x, y, colUnit, rowH).stroke();
        doc.text('шт', x + 2, y + 2, { width: colUnit - 4 });
        x += colUnit;
        doc.rect(x, y, colPrice, rowH).stroke();
        doc.text(sumStr, x + 2, y + 2, { width: colPrice - 4, align: 'right' });
        x += colPrice;
        doc.rect(x, y, colSum, rowH).stroke();
        doc.text(sumStr, x + 2, y + 2, { width: colSum - 4, align: 'right' });
        y += rowH + mm(3);

        /* --- Итого --- */
        doc.fontSize(9);
        const tw = colPrice + colSum;
        doc.font(INVOICE_FONT_REG_NAME).text('Итого:', margin + W - tw, y, { width: colPrice - 2, align: 'right' });
        doc.text(sumStr, margin + W - colSum, y, { width: colSum - 2, align: 'right' });
        y += mm(8);

        doc.fontSize(9).text(`Всего наименований 1 на сумму ${sumStr} рублей (${words})`, margin, y, {
            width: W,
        });
        y += mm(10);

        doc.fontSize(8).fillColor('#333333').text(`Назначение платежа: ${params.paymentPurpose}`, margin, y, {
            width: W,
        });
        y += mm(10);
        doc.fillColor('#000000');
        hrBlack(doc, margin, y, W);
        y += mm(5);

        const stampPath = join(process.cwd(), 'static', 'invoice-pechat.jpg');
        if (existsSync(stampPath)) {
            try {
                doc.image(stampPath, margin, y, { width: W, height: mm(35) });
                y += mm(38);
            } catch {
                /* ignore broken image */
            }
        }

        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
    });
}

export async function renderInvoicePdfToFile(params: InvoicePdfParams, fileName: string): Promise<string> {
    const dir = join(process.cwd(), 'static', 'org-documents');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const outPath = join(dir, fileName);
    await writePdfToPath(params, outPath);
    return join('org-documents', fileName).replace(/\\/g, '/');
}
