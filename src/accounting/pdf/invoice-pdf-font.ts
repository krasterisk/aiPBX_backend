import { existsSync } from 'fs';
import { join } from 'path';

export const INVOICE_FONT_REG_NAME = 'invoice-main';

/**
 * TTF с кириллицей для PDFKit (встроенные Helvetica не рисуют кириллицу).
 * Порядок: INVOICE_PDF_FONT_PATH → static/fonts → системные Arial/DejaVu/Liberation.
 */
export function resolveInvoicePdfFontPath(): string {
    const envPath = process.env.INVOICE_PDF_FONT_PATH?.trim();
    if (envPath && existsSync(envPath)) {
        return envPath;
    }
    const candidates = [
        join(process.cwd(), 'static', 'fonts', 'DejaVuSans.ttf'),
        join(process.cwd(), 'static', 'fonts', 'DejaVuSansCondensed.ttf'),
        join(process.cwd(), 'static', 'fonts', 'NotoSans-Regular.ttf'),
        'C:\\Windows\\Fonts\\arial.ttf',
        'C:\\Windows\\Fonts\\Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    ];
    for (const p of candidates) {
        if (existsSync(p)) return p;
    }
    throw new Error(
        'Не найден TTF-шрифт с кириллицей для PDF счёта. Задайте INVOICE_PDF_FONT_PATH ' +
            'или положите файл static/fonts/DejaVuSans.ttf (см. https://dejavu-fonts.github.io/).',
    );
}
