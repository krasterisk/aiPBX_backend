import { Injectable, Logger } from '@nestjs/common';

/**
 * Parser Service — extracts plain text from various file formats and URLs.
 *
 * Supported:
 *   - PDF (via pdf-parse)
 *   - DOCX (via mammoth)
 *   - XLSX / XLS (via SheetJS)
 *   - CSV (via SheetJS)
 *   - TXT / MD (as-is)
 *   - URL (via cheerio — HTML → text)
 */
@Injectable()
export class ParserService {
    private readonly logger = new Logger(ParserService.name);

    /**
     * Parse buffer into plain text based on file type.
     */
    async parseFile(buffer: Buffer, fileType: string, fileName?: string): Promise<string> {
        switch (fileType.toLowerCase()) {
            case 'pdf':
                return this.parsePdf(buffer);
            case 'docx':
                return this.parseDocx(buffer);
            case 'xlsx':
            case 'xls':
                return this.parseExcel(buffer, fileName);
            case 'csv':
                return this.parseCsv(buffer, fileName);
            case 'txt':
            case 'md':
            case 'text':
                return buffer.toString('utf-8');
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    /**
     * Fetch a URL and extract text content from HTML.
     */
    async parseUrl(url: string): Promise<string> {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; aiPBX Knowledge Bot/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,text/plain',
                },
                signal: AbortSignal.timeout(30000),
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const contentType = res.headers.get('content-type') || '';
            const body = await res.text();

            if (contentType.includes('text/plain')) {
                return body;
            }

            // Parse HTML
            return this.extractTextFromHtml(body);
        } catch (err) {
            this.logger.error(`Failed to parse URL ${url}: ${err.message}`);
            throw new Error(`Failed to fetch URL: ${err.message}`);
        }
    }

    /**
     * Extract text from PDF using pdf-parse.
     */
    private async parsePdf(buffer: Buffer): Promise<string> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { PDFParse } = require('pdf-parse');
            const parser = new PDFParse({ data: buffer, verbosity: 0 });
            const result = await parser.getText();
            await parser.destroy();
            return result.text || '';
        } catch (err) {
            this.logger.error(`PDF parse error: ${err.message}`);
            throw new Error(`Failed to parse PDF: ${err.message}. Is pdf-parse installed?`);
        }
    }

    /**
     * Extract text from DOCX using mammoth.
     */
    private async parseDocx(buffer: Buffer): Promise<string> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            return result.value || '';
        } catch (err) {
            this.logger.error(`DOCX parse error: ${err.message}`);
            throw new Error(`Failed to parse DOCX: ${err.message}. Is mammoth installed?`);
        }
    }

    /**
     * Extract text from Excel files (.xlsx / .xls) using SheetJS.
     * Converts each sheet into a tab-separated text block with headers.
     */
    private parseExcel(buffer: Buffer, fileName?: string): string {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });

            const parts: string[] = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                // Convert to array of arrays for better text representation
                const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (!rows.length) continue;

                const header = workbook.SheetNames.length > 1
                    ? `=== Лист: ${sheetName} ===\n`
                    : '';

                const textRows = rows
                    .filter((row: any[]) => row.some((cell: any) => cell !== '' && cell != null))
                    .map((row: any[]) => row.map((cell: any) => String(cell ?? '').trim()).join('\t'));

                if (textRows.length > 0) {
                    parts.push(header + textRows.join('\n'));
                }
            }

            return parts.join('\n\n') || '';
        } catch (err) {
            this.logger.error(`Excel parse error: ${err.message}`);
            throw new Error(`Failed to parse Excel file: ${err.message}. Is xlsx installed?`);
        }
    }

    /**
     * Parse CSV file using SheetJS.
     */
    private parseCsv(buffer: Buffer, fileName?: string): string {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const XLSX = require('xlsx');
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            return rows
                .filter((row: any[]) => row.some((cell: any) => cell !== '' && cell != null))
                .map((row: any[]) => row.map((cell: any) => String(cell ?? '').trim()).join('\t'))
                .join('\n');
        } catch (err) {
            this.logger.error(`CSV parse error: ${err.message}`);
            throw new Error(`Failed to parse CSV: ${err.message}. Is xlsx installed?`);
        }
    }

    /**
     * Extract meaningful text from HTML (remove nav, scripts, styles, etc).
     * Uses cheerio for server-side HTML parsing.
     */
    private extractTextFromHtml(html: string): string {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const cheerio = require('cheerio');
            const $ = cheerio.load(html);

            // Remove non-content elements
            $('script, style, nav, header, footer, iframe, noscript, svg, form, button').remove();
            $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
            $('.nav, .navbar, .menu, .sidebar, .footer, .header, .cookie-banner').remove();

            // Get text from content areas
            let text = '';
            const contentSelectors = ['main', 'article', '.content', '#content', '.post', '.entry'];
            for (const sel of contentSelectors) {
                const el = $(sel);
                if (el.length > 0) {
                    text = el.text();
                    break;
                }
            }

            // Fallback to body text
            if (!text) {
                text = $('body').text();
            }

            // Normalize whitespace
            return text
                .replace(/\s+/g, ' ')
                .replace(/\n\s*\n/g, '\n\n')
                .trim();
        } catch (err) {
            this.logger.error(`HTML parse error: ${err.message}`);
            // Fallback: strip tags with regex
            return html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
    }
}
