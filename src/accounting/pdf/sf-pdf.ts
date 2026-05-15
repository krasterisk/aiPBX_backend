/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface SfPdfParams {
    number: string;
    documentDate: string;
    amountRub: number;
    subject: string;
    customerName: string;
    advance: boolean;
}

function writeSf(params: SfPdfParams, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = createWriteStream(outPath);
        doc.pipe(stream);
        doc.fontSize(16).text(params.advance ? 'Счёт-фактура (аванс)' : 'Счёт-фактура', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`№ ${params.number} от ${params.documentDate}`, { align: 'right' });
        doc.moveDown().text(`Покупатель: ${params.customerName}`);
        doc.text(`Наименование: ${params.subject}`);
        doc.text(`Сумма: ${params.amountRub.toFixed(2)} RUB (без НДС)`);
        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
    });
}

export async function renderSfPdfToFile(params: SfPdfParams, fileName: string): Promise<string> {
    const dir = join(process.cwd(), 'static', 'org-documents');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const outPath = join(dir, fileName);
    await writeSf(params, outPath);
    return join('org-documents', fileName).replace(/\\/g, '/');
}
