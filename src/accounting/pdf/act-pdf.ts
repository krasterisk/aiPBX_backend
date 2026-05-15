/* eslint-disable @typescript-eslint/no-require-imports */
const PDFDocument = require('pdfkit');
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ActPdfParams {
    number: string;
    documentDate: string;
    periodFrom: string;
    periodTo: string;
    amountRub: number;
    subject: string;
    customerName: string;
}

function writeAct(params: ActPdfParams, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = createWriteStream(outPath);
        doc.pipe(stream);
        doc.fontSize(16).text('Акт оказанных услуг', { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`№ ${params.number} от ${params.documentDate}`, { align: 'right' });
        doc.text(`Период: ${params.periodFrom} — ${params.periodTo}`);
        doc.moveDown().fontSize(10).text(`Заказчик: ${params.customerName}`);
        doc.moveDown().text(`Услуга: ${params.subject}`);
        doc.text(`Сумма: ${params.amountRub.toFixed(2)} RUB (без НДС)`);
        doc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
    });
}

export async function renderActPdfToFile(params: ActPdfParams, fileName: string): Promise<string> {
    const dir = join(process.cwd(), 'static', 'org-documents');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const outPath = join(dir, fileName);
    await writeAct(params, outPath);
    return join('org-documents', fileName).replace(/\\/g, '/');
}
